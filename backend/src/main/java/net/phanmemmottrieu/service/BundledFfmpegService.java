package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ws.schild.jave.process.ffmpeg.DefaultFFMPEGLocator;

import jakarta.annotation.PostConstruct;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * FFmpeg bundled inside backend via ws.schild:jave-all-deps — không cần cài ffmpeg OS.
 */
@Service
public class BundledFfmpegService {

    private static final Logger log = LoggerFactory.getLogger(BundledFfmpegService.class);
    private static final long DEFAULT_TIMEOUT_SEC = 120;

    private volatile String executablePath = "";
    private volatile boolean ready;

    @PostConstruct
    void init() {
        try {
            DefaultFFMPEGLocator locator = new DefaultFFMPEGLocator();
            String path = locator.getExecutablePath();
            Path bin = Path.of(path);
            ready = Files.isExecutable(bin);
            executablePath = path;
            if (ready) {
                log.info("Bundled FFmpeg ready: {}", path);
            } else {
                log.warn("Bundled FFmpeg path not executable: {}", path);
            }
        } catch (Exception ex) {
            ready = false;
            log.warn("Bundled FFmpeg init failed: {}", ex.getMessage());
        }
    }

    public boolean isReady() {
        return ready && executablePath != null && !executablePath.isBlank();
    }

    public String getExecutablePath() {
        return executablePath;
    }

    public record FfmpegResult(int exitCode, String output) {}

    public FfmpegResult run(List<String> args, long timeoutSec) throws Exception {
        if (!isReady()) {
            throw new IllegalStateException("Bundled FFmpeg chưa sẵn sàng — kiểm tra dependency jave-all-deps");
        }
        List<String> command = new ArrayList<>();
        command.add(executablePath);
        command.addAll(args);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);
        Process process = pb.start();

        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }

        boolean finished = process.waitFor(Math.max(5, timeoutSec), TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("FFmpeg timeout sau " + timeoutSec + "s");
        }
        return new FfmpegResult(process.exitValue(), output);
    }

    /**
     * Tạo MP4 slideshow từ một ảnh tĩnh (ảnh đã compose đúng kích thước output).
     */
    public void imageToMp4(Path imagePath, Path videoPath, int durationSec) throws Exception {
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);

        if (!Files.isRegularFile(imagePath) || Files.size(imagePath) <= 0) {
            throw new IllegalArgumentException("Ảnh nguồn không tồn tại: " + imagePath);
        }

        List<String> args = List.of(
            "-y",
            "-framerate", "30",
            "-loop", "1",
            "-i", imagePath.toAbsolutePath().toString(),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-t", String.valueOf(Math.max(1, durationSec)),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            videoPath.toAbsolutePath().toString()
        );

        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
            String tail = result.output() == null ? "" : result.output();
            if (tail.length() > 1800) {
                tail = tail.substring(tail.length() - 1800);
            }
            log.error("Bundled FFmpeg imageToMp4 failed exit={} image={} video={} logTail={}",
                result.exitCode(), imagePath, videoPath, tail);
            throw new IllegalStateException("FFmpeg exit=" + result.exitCode() + " — " + summarizeFfmpegError(result.output()));
        }
        log.info("Bundled FFmpeg imageToMp4 ok video={} bytes={}", videoPath.getFileName(), Files.size(videoPath));
    }

    /** Ken Burns nhẹ — zoom in chậm cho template pro scene clip. */
    public void imageKenBurnsToMp4(Path imagePath, Path videoPath, int durationSec) throws Exception {
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);
        int dur = Math.max(1, durationSec);
        String vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
            + "zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + (dur * 30)
            + ":s=1080x1920:fps=30";
        List<String> args = List.of(
            "-y",
            "-loop", "1",
            "-i", imagePath.toAbsolutePath().toString(),
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-t", String.valueOf(dur),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            videoPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
            imageToMp4(imagePath, videoPath, durationSec);
        }
    }

    /**
     * Character Director — nền tĩnh + nhân vật cutout overlay có chuyển động theo action (không zoom cả khung).
     */
    public void presenterSceneToMp4(
        Path backgroundPath,
        Path characterPngPath,
        Path videoPath,
        int durationSec,
        String characterAction,
        String shotType,
        String placement
    ) throws Exception {
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);
        int dur = Math.max(1, durationSec);
        int charWidth = switch (String.valueOf(shotType).toLowerCase()) {
            case "closeup" -> 620;
            case "wide" -> 380;
            default -> 480;
        };

        String overlay = buildPresenterOverlayExpr(characterAction, shotType, placement);
        String filter = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[bg];"
            + "[1:v]scale=" + charWidth + ":-1[char];"
            + "[bg][char]overlay=" + overlay + ":format=auto:shortest=1[v]";

        List<String> args = List.of(
            "-y",
            "-loop", "1",
            "-i", backgroundPath.toAbsolutePath().toString(),
            "-loop", "1",
            "-i", characterPngPath.toAbsolutePath().toString(),
            "-filter_complex", filter,
            "-map", "[v]",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-t", String.valueOf(dur),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            videoPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
            log.warn("presenterSceneToMp4 overlay failed (exit={}), fallback static preview path needed",
                result.exitCode());
            throw new IllegalStateException("presenter overlay failed: " + summarizeFfmpegError(result.output()));
        }
        log.info("presenterSceneToMp4 ok video={} bytes={}", videoPath.getFileName(), Files.size(videoPath));
    }

    private static String buildPresenterOverlayExpr(String characterAction, String shotType, String placement) {
        String action = String.valueOf(characterAction == null ? "" : characterAction).toLowerCase();
        String place = String.valueOf(placement == null ? "" : placement).toLowerCase();
        String baseY = "H*0.52-h/2";
        String baseX;
        if (place.contains("right")) {
            baseX = "W-w-W*0.08";
        } else if (place.contains("center")) {
            baseX = "(W-w)/2";
        } else {
            baseX = "W*0.08";
        }

        if (action.contains("walk")) {
            return "x='if(lt(t,1.2),W-w-(W*0.92)*t/1.2," + baseX + "+8*sin(2*PI*t/2))':y='" + baseY + "+4*sin(2*PI*t/0.6)'";
        }
        if (action.contains("gesture")) {
            return "x='" + baseX + "+10*sin(2*PI*t/3)':y='" + baseY + "+5*sin(2*PI*t/0.8)'";
        }
        if (action.contains("showcase")) {
            return "x='" + baseX + "':y='" + baseY + "+2*sin(2*PI*t/1.2)'";
        }
        // speak_to_camera — subtle presenter idle / talking motion
        return "x='" + baseX + "+4*sin(2*PI*t/2.5)':y='" + baseY + "+3*sin(2*PI*t/0.5)'";
    }

    /**
     * Talking Presenter audiogram — portrait tĩnh + audio TTS → MP4 9:16 (không cần sidecar Python).
     */
    public void portraitAudiogramToMp4(Path imagePath, Path audioPath, Path videoPath) throws Exception {
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);
        if (!Files.isRegularFile(imagePath) || Files.size(imagePath) <= 0) {
            throw new IllegalArgumentException("Ảnh portrait không tồn tại: " + imagePath);
        }
        if (!Files.isRegularFile(audioPath) || Files.size(audioPath) <= 0) {
            throw new IllegalArgumentException("Audio TTS không tồn tại: " + audioPath);
        }
        String vf = "scale=1080:1920:force_original_aspect_ratio=decrease,"
            + "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p";
        List<String> args = List.of(
            "-y",
            "-loop", "1",
            "-i", imagePath.toAbsolutePath().toString(),
            "-i", audioPath.toAbsolutePath().toString(),
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "stillimage",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            videoPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
            throw new IllegalStateException("audiogram failed: " + summarizeFfmpegError(result.output()));
        }
        log.info("portraitAudiogramToMp4 ok video={} bytes={}", videoPath.getFileName(), Files.size(videoPath));
    }

    /** Chuyển AIFF/MP3 sang WAV mono 22050Hz (dùng sau macOS say). */
    public void convertToWav(Path inputPath, Path wavPath) throws Exception {
        Files.createDirectories(wavPath.getParent());
        Files.deleteIfExists(wavPath);
        List<String> args = List.of(
            "-y",
            "-i", inputPath.toAbsolutePath().toString(),
            "-ar", "22050",
            "-ac", "1",
            wavPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, 60);
        if (result.exitCode() != 0 || !Files.isRegularFile(wavPath) || Files.size(wavPath) <= 0) {
            throw new IllegalStateException("convertToWav failed: " + summarizeFfmpegError(result.output()));
        }
    }

    /**
     * Martial cinematic — một composite PNG + motion preset (dolly, dodge shake, hero rim).
     */
    public void martialSceneToMp4(Path compositePath, Path videoPath, int durationSec, String motionPreset) throws Exception {
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);
        int dur = Math.max(1, durationSec);
        int frames = dur * 30;
        String preset = String.valueOf(motionPreset == null ? "" : motionPreset).toLowerCase();
        String zoompan = buildMartialZoompan(preset, frames);
        List<String> args = List.of(
            "-y",
            "-loop", "1",
            "-i", compositePath.toAbsolutePath().toString(),
            "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920," + zoompan,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-t", String.valueOf(dur),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            videoPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
            throw new IllegalStateException("martialSceneToMp4 failed: " + summarizeFfmpegError(result.output()));
        }
        log.info("martialSceneToMp4 ok preset={} video={}", preset, videoPath.getFileName());
    }

    /** Martial combo — chuỗi frame PNG → clip MP4. */
    public void martialPoseSequenceToMp4(List<Path> framePaths, Path videoPath, int durationSec) throws Exception {
        if (framePaths == null || framePaths.isEmpty()) {
            throw new IllegalArgumentException("Không có frame cho pose sequence");
        }
        Files.createDirectories(videoPath.getParent());
        Files.deleteIfExists(videoPath);
        int dur = Math.max(1, durationSec);
        double fps = Math.max(1.0, framePaths.size() / (double) dur);
        Path listFile = Files.createTempFile("martial-frames-", ".txt");
        try {
            StringBuilder sb = new StringBuilder();
            for (Path frame : framePaths) {
                sb.append("file '").append(frame.toAbsolutePath()).append("'\n");
                sb.append("duration ").append(String.format(Locale.ROOT, "%.3f", 1.0 / fps)).append("\n");
            }
            sb.append("file '").append(framePaths.get(framePaths.size() - 1).toAbsolutePath()).append("'\n");
            Files.writeString(listFile, sb.toString());

            List<String> args = List.of(
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", listFile.toAbsolutePath().toString(),
                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-t", String.valueOf(dur),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                videoPath.toAbsolutePath().toString()
            );
            FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
            if (result.exitCode() != 0 || !Files.isRegularFile(videoPath) || Files.size(videoPath) <= 0) {
                Path first = framePaths.get(0);
                imageKenBurnsToMp4(first, videoPath, dur);
            }
        } finally {
            Files.deleteIfExists(listFile);
        }
        log.info("martialPoseSequenceToMp4 ok frames={} video={}", framePaths.size(), videoPath.getFileName());
    }

    /** Color grade cinematic sau khi concat các scene. */
    public void applyCinematicGrade(Path inputPath, Path outputPath) throws Exception {
        Files.createDirectories(outputPath.getParent());
        Files.deleteIfExists(outputPath);
        String vf = "eq=contrast=1.08:brightness=-0.03:saturation=1.12,"
            + "colorbalance=rs=-0.04:gs=0.02:bs=0.06,"
            + "vignette=PI/5";
        List<String> args = List.of(
            "-y",
            "-i", inputPath.toAbsolutePath().toString(),
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            outputPath.toAbsolutePath().toString()
        );
        FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
        if (result.exitCode() != 0 || !Files.isRegularFile(outputPath) || Files.size(outputPath) <= 0) {
            Files.copy(inputPath, outputPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static String buildMartialZoompan(String preset, int frames) {
        if (preset.contains("dodge")) {
            return "zoompan=z='1.06+0.025*sin(2*PI*on/45)':"
                + "x='iw/2-(iw/zoom/2)+28*sin(12*PI*on/" + frames + ")':"
                + "y='ih/2-(ih/zoom/2)+8*sin(2*PI*on/30)':d=" + frames + ":s=1080x1920:fps=30";
        }
        if (preset.contains("hero")) {
            return "zoompan=z='min(zoom+0.0006,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*0.15':d="
                + frames + ":s=1080x1920:fps=30";
        }
        // dolly_up default — hero reveal
        return "zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='max(ih/2-(ih/zoom/2)-on*0.25,0)':d="
            + frames + ":s=1080x1920:fps=30";
    }

    /** Ghép nhiều clip MP4 cùng codec (scene clips). */
    public void concatMp4Clips(List<Path> clips, Path output) throws Exception {
        if (clips == null || clips.isEmpty()) {
            throw new IllegalArgumentException("Không có clip để ghép");
        }
        if (clips.size() == 1) {
            Files.copy(clips.get(0), output, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            return;
        }
        Files.createDirectories(output.getParent());
        Files.deleteIfExists(output);
        Path listFile = Files.createTempFile("ffmpeg-concat-", ".txt");
        try {
            StringBuilder sb = new StringBuilder();
            for (Path clip : clips) {
                sb.append("file '").append(clip.toAbsolutePath()).append("'\n");
            }
            Files.writeString(listFile, sb.toString());
            List<String> args = List.of(
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", listFile.toAbsolutePath().toString(),
                "-c", "copy",
                output.toAbsolutePath().toString()
            );
            FfmpegResult result = run(args, DEFAULT_TIMEOUT_SEC);
            if (result.exitCode() != 0 || !Files.isRegularFile(output)) {
                throw new IllegalStateException("FFmpeg concat failed exit=" + result.exitCode());
            }
        } finally {
            Files.deleteIfExists(listFile);
        }
    }

    private static String summarizeFfmpegError(String output) {
        if (output == null || output.isBlank()) {
            return "không có log FFmpeg";
        }
        String[] lines = output.split("\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.contains("Error") || line.contains("error") || line.contains("Invalid")) {
                return line;
            }
        }
        return lines[lines.length - 1].trim();
    }
}
