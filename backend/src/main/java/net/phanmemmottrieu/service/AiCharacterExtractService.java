package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class AiCharacterExtractService {

    private static final Logger log = LoggerFactory.getLogger(AiCharacterExtractService.class);

    @Autowired(required = false)
    private BundledRembgService bundledRembgService;

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.character.enabled:true}")
    private boolean enabled;

    public record ExtractResult(
        boolean success,
        String cutoutUrl,
        String cutoutFileName,
        String method,
        boolean hasAlpha,
        String message,
        String errorCode
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            if (cutoutUrl != null) out.put("cutoutUrl", cutoutUrl);
            if (cutoutFileName != null) out.put("cutoutFileName", cutoutFileName);
            out.put("method", method);
            out.put("hasAlpha", hasAlpha);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Map<String, Object> describeStatus() {
        if (bundledRembgService != null) {
            return bundledRembgService.describeStatus();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", "onnxruntime-u2netp-bundled");
        out.put("ready", false);
        out.put("initError", "BundledRembgService unavailable");
        return out;
    }

    public ExtractResult extract(byte[] imageBytes, String mimeType, String appId) {
        if (!enabled) {
            return fail("CHARACTER_DISABLED", "Character extract tắt");
        }
        if (imageBytes == null || imageBytes.length == 0) {
            return fail("MISSING_IMAGE", "Thiếu ảnh nhân vật");
        }
        String safeApp = normalizeAppId(appId);
        try {
            byte[] pngBytes;
            String method;
            boolean hasAlpha;

            if (bundledRembgService != null) {
                try {
                    BundledRembgService.CutoutResult cutout = bundledRembgService.removeBackground(imageBytes);
                    pngBytes = cutout.pngBytes();
                    method = cutout.method();
                    hasAlpha = cutout.hasAlpha();
                } catch (Exception ex) {
                    log.warn("Bundled rembg failed, fallback java-png: {}", ex.getMessage());
                    pngBytes = toPngFallback(imageBytes);
                    method = "java-png-fallback";
                    hasAlpha = false;
                }
            } else {
                pngBytes = toPngFallback(imageBytes);
                method = "java-png";
                hasAlpha = false;
            }

            Path dir = Paths.get(appDataDir, "public", "app_images", safeApp);
            Files.createDirectories(dir);
            String fileName = "ai-char-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8) + ".png";
            Path outPath = dir.resolve(fileName);
            Files.write(outPath, pngBytes);

            String url = String.format("app_images/%s/%s", safeApp, fileName);
            log.info("CHARACTER_EXTRACT ok appId={} method={} hasAlpha={} file={}", safeApp, method, hasAlpha, fileName);
            return new ExtractResult(true, url, fileName, method, hasAlpha,
                hasAlpha ? "Đã bóc nền nhân vật (ONNX u2netp bundled)" : "Lưu portrait PNG (rembg chưa sẵn sàng — kiểm tra model u2netp.onnx)", null);
        } catch (Exception ex) {
            log.error("CHARACTER_EXTRACT failed: {}", ex.getMessage(), ex);
            return fail("EXTRACT_FAILED", ex.getMessage());
        }
    }

    public BufferedImage loadCutoutFromBytes(byte[] pngBytes) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(pngBytes));
    }

    private byte[] toPngFallback(byte[] imageBytes) throws Exception {
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(imageBytes));
        if (img == null) {
            throw new IllegalArgumentException("Không decode được ảnh");
        }
        BufferedImage rgba = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_ARGB);
        rgba.getGraphics().drawImage(img, 0, 0, null);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(rgba, "png", baos);
        return baos.toByteArray();
    }

    private String normalizeAppId(String raw) {
        String appId = String.valueOf(raw == null ? "csm" : raw).trim();
        if (appId.isBlank()) appId = "csm";
        return appId.replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private ExtractResult fail(String code, String message) {
        return new ExtractResult(false, null, null, "", false, message, code);
    }
}
