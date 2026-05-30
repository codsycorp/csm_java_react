package net.phanmemmottrieu.service;

import jakarta.annotation.PreDestroy;
import net.ladenthin.llama.ChatMessage;
import net.ladenthin.llama.ContentPart;
import net.ladenthin.llama.InferenceParameters;
import net.ladenthin.llama.LlamaModel;
import net.ladenthin.llama.ModelParameters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * In-JVM SmolVLM vision lane (Q.12). Loads GGUF + mmproj via net.ladenthin llama binding.
 * Swaps with {@link LlamaCppNativeService} on weak-RAM hosts — only one GGUF stack at a time.
 */
@Service
public class AiLocalLlamaVisionNativeService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalLlamaVisionNativeService.class);

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Value("${ai.orchestration.multimodal.vision.native.enabled:false}")
    private boolean nativeEnabled;

    @Value("${ai.orchestration.multimodal.vision.model-path:./csm_datas/ai_local/model/SmolVLM2-256M-Video-Instruct-Q8_0.gguf}")
    private String visionModelPath;

    @Value("${ai.orchestration.multimodal.vision.mmproj-path:./csm_datas/ai_local/model/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf}")
    private String mmprojPath;

    @Value("${ai.orchestration.multimodal.vision.native.unload-after-scan:true}")
    private boolean unloadAfterScan;

    @Value("${ai.orchestration.multimodal.vision.native.swap-worker:true}")
    private boolean swapWorker;

    @Value("${ai.orchestration.multimodal.vision.native.context-window:2048}")
    private int contextWindow;

    @Value("${ai.orchestration.multimodal.vision.native.threads:2}")
    private int threads;

    @Value("${ai.orchestration.multimodal.vision.native.max-tokens:512}")
    private int maxTokens;

    @Value("${ai.orchestration.multimodal.vision.native.gpu-layers:0}")
    private int gpuLayers;

    private final Object modelLock = new Object();
    private volatile LlamaModel model;
    private volatile boolean shuttingDown;
    private volatile String lastFailureReason = "";

    public boolean isEnabled() {
        return nativeEnabled;
    }

    public boolean isReady() {
        if (!nativeEnabled || shuttingDown) {
            return false;
        }
        Path model = resolvePath(visionModelPath);
        Path mmproj = resolvePath(mmprojPath);
        return Files.isRegularFile(model) && Files.isRegularFile(mmproj);
    }

    public Map<String, Object> describeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        Path model = resolvePath(visionModelPath);
        Path mmproj = resolvePath(mmprojPath);
        out.put("provider", "llama.cpp-native-vision");
        out.put("enabled", nativeEnabled);
        out.put("ready", isReady());
        out.put("loaded", isModelLoaded());
        out.put("modelPath", model.toString());
        out.put("modelExists", Files.isRegularFile(model));
        out.put("mmprojPath", mmproj.toString());
        out.put("mmprojExists", Files.isRegularFile(mmproj));
        out.put("unloadAfterScan", unloadAfterScan);
        out.put("swapWorker", swapWorker);
        out.put("lastFailureReason", lastFailureReason);
        return out;
    }

    public String describeImage(String prompt, String imageBase64, String mimeType) {
        if (!isReady() || imageBase64 == null || imageBase64.isBlank()) {
            return "";
        }
        try {
            byte[] imageBytes = Base64.getDecoder().decode(imageBase64.trim());
            if (imageBytes.length == 0) {
                return "";
            }
            String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
            if (safePrompt.isBlank()) {
                safePrompt = "Describe this image for software implementation.";
            }
            String safeMime = String.valueOf(mimeType == null ? "" : mimeType).trim();
            if (safeMime.isBlank()) {
                safeMime = "image/jpeg";
            }

            if (swapWorker && llamaCppNativeService != null && llamaCppNativeService.isWorkerModelLoaded()) {
                log.info("Vision native: unloading text worker before SmolVLM infer");
                llamaCppNativeService.unloadLoadedModelForVisionSwap();
            }

            LlamaModel localModel = ensureModelLoaded();
            ChatMessage user = ChatMessage.userMultimodal(
                ContentPart.text(safePrompt),
                ContentPart.imageBytes(imageBytes, safeMime)
            );
            InferenceParameters inference = new InferenceParameters("")
                .setMessages(List.of(user))
                .setUseChatTemplate(true)
                .setNPredict(Math.max(64, maxTokens))
                .setTemperature(0.1f)
                .setTopP(0.9f);

            String description;
            synchronized (modelLock) {
                description = localModel.chatCompleteText(inference);
            }
            lastFailureReason = "";
            String trimmed = String.valueOf(description == null ? "" : description).trim();
            if (unloadAfterScan) {
                unloadModelQuietly();
            }
            return trimmed;
        } catch (Exception ex) {
            lastFailureReason = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            log.warn("Native SmolVLM vision failed: {}", lastFailureReason);
            unloadModelQuietly();
            return "";
        }
    }

    public void unloadModelQuietly() {
        synchronized (modelLock) {
            LlamaModel toClose = model;
            model = null;
            if (toClose != null) {
                try {
                    toClose.close();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        }
    }

    public boolean isModelLoaded() {
        synchronized (modelLock) {
            return model != null;
        }
    }

    @PreDestroy
    public void close() {
        shuttingDown = true;
        unloadModelQuietly();
    }

    private LlamaModel ensureModelLoaded() {
        synchronized (modelLock) {
            if (shuttingDown) {
                throw new IllegalStateException("Native vision provider is shutting down");
            }
            if (model != null) {
                return model;
            }
            Path modelPath = resolvePath(visionModelPath);
            Path mmprojFile = resolvePath(mmprojPath);
            if (!Files.isRegularFile(modelPath)) {
                throw new IllegalStateException("Vision GGUF not found: " + modelPath);
            }
            if (!Files.isRegularFile(mmprojFile)) {
                throw new IllegalStateException("Vision mmproj not found: " + mmprojFile);
            }

            int safeThreads = Math.max(1, threads);
            ModelParameters parameters = new ModelParameters()
                .setModel(modelPath.toAbsolutePath().toString())
                .setMmproj(mmprojFile.toAbsolutePath().toString())
                .setCtxSize(Math.max(1024, contextWindow))
                .setThreads(safeThreads)
                .setThreadsBatch(safeThreads)
                .setBatchSize(256)
                .setUbatchSize(128);
            if (gpuLayers >= 0) {
                parameters.setGpuLayers(gpuLayers);
            }

            log.info("Loading native SmolVLM vision: model={} mmproj={}", modelPath.getFileName(), mmprojFile.getFileName());
            model = new LlamaModel(parameters);
            return model;
        }
    }

    private Path resolvePath(String rawPath) {
        String p = String.valueOf(rawPath == null ? "" : rawPath).trim();
        if (p.isBlank()) {
            return Paths.get("csm_datas/ai_local/model").toAbsolutePath().normalize();
        }
        Path path = Paths.get(p);
        if (!path.isAbsolute()) {
            path = Paths.get(System.getProperty("user.dir"), p);
        }
        return path.toAbsolutePath().normalize();
    }
}
