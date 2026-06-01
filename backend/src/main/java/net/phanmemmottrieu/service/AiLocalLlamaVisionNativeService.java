package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Placeholder for in-JVM SmolVLM (Q.12). On M1 dev, vision uses sidecar :8090 only.
 * Native in-JVM vision requires net.ladenthin fork (mmproj) — not bundled with de.kherud 4.1.0.
 */
@Service
public class AiLocalLlamaVisionNativeService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalLlamaVisionNativeService.class);

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

    private volatile String lastFailureReason = "";

    public boolean isEnabled() {
        return nativeEnabled;
    }

    public boolean isReady() {
        return false;
    }

    public Map<String, Object> describeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        Path model = resolvePath(visionModelPath);
        Path mmproj = resolvePath(mmprojPath);
        out.put("provider", "sidecar-fallback");
        out.put("enabled", nativeEnabled);
        out.put("ready", false);
        out.put("loaded", false);
        out.put("modelPath", model.toString());
        out.put("modelExists", Files.isRegularFile(model));
        out.put("mmprojPath", mmproj.toString());
        out.put("mmprojExists", Files.isRegularFile(mmproj));
        out.put("unloadAfterScan", unloadAfterScan);
        out.put("swapWorker", swapWorker);
        out.put("lastFailureReason", lastFailureReason);
        out.put("note", "In-JVM native vision disabled; use ai.orchestration.multimodal.vision.endpoint sidecar.");
        return out;
    }

    public String describeImage(String prompt, String imageBase64, String mimeType) {
        if (!nativeEnabled) {
            return "";
        }
        lastFailureReason = "In-JVM SmolVLM requires net.ladenthin llama fork; use vision sidecar on M1.";
        log.debug("Native vision skipped: {}", lastFailureReason);
        return "";
    }

    public void unloadModelQuietly() {
        // no-op
    }

    public boolean isModelLoaded() {
        return false;
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
