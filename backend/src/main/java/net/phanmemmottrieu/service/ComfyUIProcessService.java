package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
public class ComfyUIProcessService {
    private static final Logger log = LoggerFactory.getLogger(ComfyUIProcessService.class);

    @Value("${comfyui.install.path:}")
    private String comfyuiInstallPath;

    @Value("${ltx.video.model:}")
    private String ltxVideoModel;

    @Value("${comfyui.python.command:python3}")
    private String pythonCommand;

    @Value("${comfyui.process.timeout-ms:120000}")
    private long processTimeoutMs;

    public boolean isConfigured() {
        return comfyuiInstallPath != null && !comfyuiInstallPath.isBlank()
            && ltxVideoModel != null && !ltxVideoModel.isBlank();
    }

    public boolean isAvailable() {
        return isConfigured()
            && Files.isDirectory(Paths.get(comfyuiInstallPath))
            && Files.isRegularFile(Paths.get(ltxVideoModel));
    }

    public String getComfyUIInstallPath() {
        return comfyuiInstallPath;
    }

    public String getLtxVideoModelPath() {
        return ltxVideoModel;
    }

    public String processRequest(String prompt) {
        if (!isConfigured()) {
            return "Lỗi: Chưa cấu hình comfyui.install.path hoặc ltx.video.model";
        }

        Path comfyPath = Paths.get(comfyuiInstallPath);
        if (!Files.isDirectory(comfyPath)) {
            return "Lỗi: Thư mục ComfyUI không tồn tại: " + comfyuiInstallPath;
        }

        Path modelPath = Paths.get(ltxVideoModel);
        if (!Files.isRegularFile(modelPath)) {
            return "Lỗi: Model LTX-Video không tồn tại: " + ltxVideoModel;
        }

        try {
            Path inputFile = Files.createTempFile("comfy-input", ".txt");
            Files.write(inputFile, prompt.getBytes(StandardCharsets.UTF_8));

            List<String> command = new ArrayList<>();
            command.add(pythonCommand);
            command.add("main.py");
            command.add("--model");
            command.add(modelPath.toString());
            command.add("--input");
            command.add(inputFile.toString());

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(comfyPath.toFile());
            pb.redirectErrorStream(true);

            Process process = null;
            try {
                process = pb.start();
            } catch (IOException ex) {
                log.warn("Failed to launch {}: {}. Falling back to python command 'python'", pythonCommand, ex.getMessage());
                command.set(0, "python");
                pb.command(command);
                process = pb.start();
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder output = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }

                boolean finished = process.waitFor(processTimeoutMs, TimeUnit.MILLISECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    return "Lỗi: Quá thời gian chạy ComfyUI (" + processTimeoutMs + " ms)";
                }

                int exitCode = process.exitValue();
                if (exitCode == 0) {
                    return output.toString();
                }
                return "Lỗi ComfyUI (mã: " + exitCode + "): " + output.toString();
            }
        } catch (Exception e) {
            log.error("ComfyUI process failed", e);
            return "Lỗi xử lý ComfyUI: " + e.getMessage();
        }
    }
}
