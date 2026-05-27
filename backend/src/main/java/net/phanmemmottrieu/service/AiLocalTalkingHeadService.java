package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Talking-head chạy trực tiếp trong backend — Bundled FFmpeg audiogram (không sidecar Python).
 * Tùy chọn SadTalker qua ProcessBuilder nếu cấu hình SADTALKER_HOME.
 */
@Service
public class AiLocalTalkingHeadService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalTalkingHeadService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Value("${ai.media.talking-head.enabled:true}")
    private boolean enabled;

    @Value("${ai.media.talking-head.sadtalker-home:}")
    private String sadtalkerHome;

    @Value("${ai.media.talking-head.sadtalker-python:python3}")
    private String sadtalkerPython;

    @Value("${ai.media.talking-head.timeout-sec:600}")
    private int timeoutSec;

    public record TalkResult(byte[] mp4Bytes, String method, boolean success, String message) {}

    public boolean isEnabled() {
        return enabled;
    }

    public Map<String, Object> describeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", "bundled-java-ffmpeg");
        out.put("enabled", enabled);
        boolean ffmpegReady = bundledFfmpegService != null && bundledFfmpegService.isReady();
        out.put("ffmpegReady", ffmpegReady);
        boolean sadConfigured = sadtalkerHome != null && !sadtalkerHome.isBlank()
            && Files.isDirectory(Path.of(sadtalkerHome));
        out.put("sadtalkerConfigured", sadConfigured);
        out.put("audiogramFallback", true);
        out.put("ready", enabled && ffmpegReady);
        out.put("method", sadConfigured ? "sadtalker|audiogram" : "audiogram");
        return out;
    }

    public TalkResult animate(byte[] portraitBytes, byte[] wavBytes) {
        if (!enabled) {
            return new TalkResult(null, "", false, "Talking-head tắt");
        }
        if (portraitBytes == null || portraitBytes.length == 0) {
            return new TalkResult(null, "", false, "Thiếu ảnh portrait");
        }
        if (wavBytes == null || wavBytes.length == 0) {
            return new TalkResult(null, "", false, "Thiếu audio TTS");
        }
        if (bundledFfmpegService == null || !bundledFfmpegService.isReady()) {
            return new TalkResult(null, "", false, "Bundled FFmpeg chưa sẵn sàng");
        }
        try {
            if (sadtalkerHome != null && !sadtalkerHome.isBlank() && Files.isDirectory(Path.of(sadtalkerHome))) {
                try {
                    byte[] mp4 = sadtalker(portraitBytes, wavBytes);
                    return new TalkResult(mp4, "sadtalker", true, "OK");
                } catch (Exception ex) {
                    log.warn("SadTalker failed, fallback audiogram: {}", ex.getMessage());
                }
            }
            byte[] mp4 = audiogram(portraitBytes, wavBytes);
            return new TalkResult(mp4, "audiogram", true, "OK");
        } catch (Exception ex) {
            log.warn("Talking-head failed: {}", ex.getMessage());
            return new TalkResult(null, "", false, ex.getMessage());
        }
    }

    private byte[] audiogram(byte[] portraitBytes, byte[] wavBytes) throws Exception {
        Path tmp = Files.createTempDirectory("csm-talk-");
        try {
            Path img = tmp.resolve("portrait.png");
            Path wav = tmp.resolve("speech.wav");
            Path mp4 = tmp.resolve("out.mp4");
            Files.write(img, portraitBytes);
            Files.write(wav, wavBytes);
            bundledFfmpegService.portraitAudiogramToMp4(img, wav, mp4);
            return Files.readAllBytes(mp4);
        } finally {
            deleteDir(tmp);
        }
    }

    private byte[] sadtalker(byte[] portraitBytes, byte[] wavBytes) throws Exception {
        Path home = Path.of(sadtalkerHome);
        Path infer = home.resolve("inference.py");
        if (!Files.isRegularFile(infer)) {
            throw new IllegalStateException("Missing SadTalker inference.py at " + infer);
        }
        Path tmp = Files.createTempDirectory("csm-sadtalker-");
        try {
            Path img = tmp.resolve("source.png");
            Path wav = tmp.resolve("driven.wav");
            Path outDir = tmp.resolve("result");
            Files.createDirectories(outDir);
            Files.write(img, portraitBytes);
            Files.write(wav, wavBytes);
            List<String> cmd = List.of(
                sadtalkerPython,
                infer.toAbsolutePath().toString(),
                "--driven_audio", wav.toAbsolutePath().toString(),
                "--source_image", img.toAbsolutePath().toString(),
                "--result_dir", outDir.toAbsolutePath().toString(),
                "--still",
                "--preprocess", "crop"
            );
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(home.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String output;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.lines().collect(Collectors.joining("\n"));
            }
            boolean finished = process.waitFor(Math.max(30, timeoutSec), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new IllegalStateException("SadTalker timeout");
            }
            if (process.exitValue() != 0) {
                throw new IllegalStateException("SadTalker exit=" + process.exitValue() + " — " + tail(output));
            }
            Path mp4 = findFirstMp4(outDir);
            if (mp4 == null) {
                throw new IllegalStateException("SadTalker không tạo mp4");
            }
            return Files.readAllBytes(mp4);
        } finally {
            deleteDir(tmp);
        }
    }

    private static Path findFirstMp4(Path dir) throws Exception {
        try (Stream<Path> walk = Files.walk(dir)) {
            return walk.filter(p -> Files.isRegularFile(p) && p.getFileName().toString().toLowerCase().endsWith(".mp4"))
                .sorted()
                .findFirst()
                .orElse(null);
        }
    }

    private static String tail(String s) {
        if (s == null || s.length() <= 400) return s == null ? "" : s;
        return s.substring(s.length() - 400);
    }

    private static void deleteDir(Path dir) {
        try {
            if (Files.isDirectory(dir)) {
                try (var walk = Files.walk(dir)) {
                    walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (Exception ignored) {}
                    });
                }
            }
        } catch (Exception ignored) {}
    }
}
