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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * TTS local chạy trực tiếp trong backend — macOS say / espeak / Piper CLI (không sidecar Python).
 */
@Service
public class AiLocalPiperTtsService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalPiperTtsService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Value("${ai.media.tts.enabled:true}")
    private boolean enabled;

    @Value("${ai.media.tts.voice:}")
    private String voice;

    @Value("${ai.media.tts.piper-bin:piper}")
    private String piperBin;

    @Value("${ai.media.tts.piper-model:}")
    private String piperModel;

    @Value("${ai.media.tts.timeout-sec:120}")
    private int timeoutSec;

    public record TtsResult(byte[] wavBytes, String method, boolean success, String message) {}

    public boolean isEnabled() {
        return enabled;
    }

    public Map<String, Object> describeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", "bundled-java");
        out.put("enabled", enabled);
        out.put("platform", System.getProperty("os.name", ""));
        boolean piperReady = piperModel != null && !piperModel.isBlank()
            && Files.isRegularFile(Path.of(piperModel)) && commandExists(piperBin);
        out.put("piperReady", piperReady);
        out.put("macosSayReady", isMacOs() && commandExists("say"));
        out.put("espeakReady", commandExists("espeak"));
        out.put("ffmpegReady", bundledFfmpegService != null && bundledFfmpegService.isReady());
        out.put("ready", enabled && (piperReady || (isMacOs() && commandExists("say")) || commandExists("espeak")));
        if (piperReady) {
            out.put("method", "piper");
        } else if (isMacOs() && commandExists("say")) {
            out.put("method", "macos_say");
        } else if (commandExists("espeak")) {
            out.put("method", "espeak");
        }
        return out;
    }

    public TtsResult synthesize(String text) {
        if (!enabled) {
            return new TtsResult(null, "", false, "TTS tắt");
        }
        String trimmed = String.valueOf(text == null ? "" : text).trim();
        if (trimmed.isBlank()) {
            return new TtsResult(null, "", false, "Text trống");
        }
        try {
            if (piperModel != null && !piperModel.isBlank() && Files.isRegularFile(Path.of(piperModel)) && commandExists(piperBin)) {
                return new TtsResult(piperCli(trimmed), "piper", true, "OK");
            }
            if (isMacOs() && commandExists("say")) {
                return new TtsResult(macosSay(trimmed), "macos_say", true, "OK");
            }
            if (commandExists("espeak")) {
                return new TtsResult(espeak(trimmed), "espeak", true, "OK");
            }
            return new TtsResult(null, "", false,
                "Không có TTS local — macOS (say), espeak hoặc cấu hình ai.media.tts.piper-model");
        } catch (Exception ex) {
            log.warn("Bundled TTS failed: {}", ex.getMessage());
            return new TtsResult(null, "", false, ex.getMessage());
        }
    }

    private byte[] macosSay(String text) throws Exception {
        if (bundledFfmpegService == null || !bundledFfmpegService.isReady()) {
            throw new IllegalStateException("Bundled FFmpeg cần thiết để chuyển say → wav");
        }
        Path tmp = Files.createTempDirectory("csm-tts-");
        try {
            Path aiff = tmp.resolve("out.aiff");
            Path wav = tmp.resolve("out.wav");
            List<String> cmd = new ArrayList<>();
            cmd.add("say");
            String v = voice == null ? "" : voice.trim();
            if (!v.isBlank()) {
                cmd.add("-v");
                cmd.add(v);
            } else {
                cmd.add("-v");
                cmd.add("Linh");
            }
            cmd.add("-o");
            cmd.add(aiff.toAbsolutePath().toString());
            cmd.add(text);
            runProcess(cmd, timeoutSec);
            bundledFfmpegService.convertToWav(aiff, wav);
            return Files.readAllBytes(wav);
        } finally {
            deleteDir(tmp);
        }
    }

    private byte[] espeak(String text) throws Exception {
        Path tmp = Files.createTempDirectory("csm-tts-");
        try {
            Path wav = tmp.resolve("out.wav");
            List<String> cmd = List.of("espeak", "-w", wav.toAbsolutePath().toString(), text);
            runProcess(cmd, timeoutSec);
            return Files.readAllBytes(wav);
        } finally {
            deleteDir(tmp);
        }
    }

    private byte[] piperCli(String text) throws Exception {
        Path tmp = Files.createTempDirectory("csm-tts-");
        try {
            Path wav = tmp.resolve("out.wav");
            List<String> cmd = List.of(
                piperBin,
                "--model", piperModel,
                "--output_file", wav.toAbsolutePath().toString()
            );
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process process = pb.start();
            process.getOutputStream().write(text.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
            waitProcess(process, timeoutSec);
            if (!Files.isRegularFile(wav) || Files.size(wav) <= 0) {
                throw new IllegalStateException("Piper không tạo được wav");
            }
            return Files.readAllBytes(wav);
        } finally {
            deleteDir(tmp);
        }
    }

    private static void runProcess(List<String> cmd, int timeout) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process process = pb.start();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            reader.lines().collect(Collectors.joining("\n"));
        }
        waitProcess(process, timeout);
    }

    private static void waitProcess(Process process, int timeout) throws Exception {
        boolean finished = process.waitFor(Math.max(5, timeout), TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("TTS timeout sau " + timeout + "s");
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException("TTS exit=" + process.exitValue());
        }
    }

    private static boolean isMacOs() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac");
    }

    private static boolean commandExists(String command) {
        if (command == null || command.isBlank()) {
            return false;
        }
        try {
            ProcessBuilder pb = new ProcessBuilder("which", command);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean ok = p.waitFor(3, TimeUnit.SECONDS) && p.exitValue() == 0;
            return ok;
        } catch (Exception ex) {
            return false;
        }
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
