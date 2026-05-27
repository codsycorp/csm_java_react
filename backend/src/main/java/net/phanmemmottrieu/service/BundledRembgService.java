package net.phanmemmottrieu.service;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.FloatBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Character background removal bundled in JVM via ONNX Runtime + u2netp model.
 * Same pattern as {@link BundledFfmpegService} — no external Python sidecar.
 */
@Service
public class BundledRembgService {

    private static final Logger log = LoggerFactory.getLogger(BundledRembgService.class);
    private static final int INPUT_SIZE = 320;
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD = {0.229f, 0.224f, 0.225f};

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.character.model-path:}")
    private String configuredModelPath;

    @Value("${ai.media.character.model-download-url:https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx}")
    private String modelDownloadUrl;

    @Value("${ai.media.character.model-auto-download:true}")
    private boolean modelAutoDownload;

    private final Object sessionLock = new Object();
    private volatile OrtEnvironment environment;
    private volatile OrtSession session;
    private volatile String inputName = "input.1";
    private volatile String loadedModelPath = "";
    private volatile boolean ready;
    private volatile String initError = "";

    public record CutoutResult(byte[] pngBytes, boolean hasAlpha, String method) {}

    @PostConstruct
    void init() {
        try {
            ensureSession();
        } catch (Exception ex) {
            initError = ex.getMessage() == null ? ex.toString() : ex.getMessage();
            ready = false;
            log.warn("Bundled rembg (ONNX u2netp) not ready at startup: {}", initError);
        }
    }

    @PreDestroy
    void shutdown() {
        synchronized (sessionLock) {
            closeQuietly(session);
            session = null;
            closeQuietly(environment);
            environment = null;
            ready = false;
        }
    }

    public boolean isReady() {
        return ready;
    }

    public String getModelPath() {
        return loadedModelPath;
    }

    public String getInitError() {
        return initError == null ? "" : initError;
    }

    public Map<String, Object> describeStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", "onnxruntime-u2netp-bundled");
        out.put("ready", ready);
        out.put("modelPath", loadedModelPath);
        out.put("modelAutoDownload", modelAutoDownload);
        out.put("initError", getInitError());
        return out;
    }

    public CutoutResult removeBackground(byte[] imageBytes) throws Exception {
        if (imageBytes == null || imageBytes.length == 0) {
            throw new IllegalArgumentException("Thiếu ảnh đầu vào");
        }
        ensureSession();
        if (!ready || session == null || environment == null) {
            throw new IllegalStateException("Bundled rembg chưa sẵn sàng: " + getInitError());
        }

        BufferedImage source = ImageIO.read(new ByteArrayInputStream(imageBytes));
        if (source == null) {
            throw new IllegalArgumentException("Không decode được ảnh");
        }
        BufferedImage rgb = toRgb(source);
        int width = rgb.getWidth();
        int height = rgb.getHeight();

        float[][] mask = runMaskInference(rgb);
        float[][] fullMask = resizeMask(mask, INPUT_SIZE, INPUT_SIZE, width, height);
        BufferedImage rgba = applyAlphaMask(rgb, fullMask);
        return new CutoutResult(toPngBytes(rgba), true, "bundled-u2netp");
    }

    private void ensureSession() throws Exception {
        if (ready && session != null) {
            return;
        }
        synchronized (sessionLock) {
            if (ready && session != null) {
                return;
            }
            closeQuietly(session);
            session = null;

            Path modelFile = resolveModelFile();
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            OrtSession.SessionOptions options = new OrtSession.SessionOptions();
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT);
            options.setIntraOpNumThreads(Math.max(1, Runtime.getRuntime().availableProcessors() / 2));

            OrtSession loaded = env.createSession(modelFile.toAbsolutePath().toString(), options);
            inputName = loaded.getInputNames().iterator().next();

            environment = env;
            session = loaded;
            loadedModelPath = modelFile.toAbsolutePath().toString();
            ready = true;
            initError = "";
            log.info("Bundled rembg ready: model={} input={}", loadedModelPath, inputName);
        }
    }

    private Path resolveModelFile() throws Exception {
        if (configuredModelPath != null && !configuredModelPath.isBlank()) {
            Path configured = Paths.get(configuredModelPath.trim()).normalize();
            if (Files.isRegularFile(configured)) {
                return configured;
            }
            if (modelAutoDownload) {
                return downloadModel(configured);
            }
            throw new IllegalStateException("Model ONNX không tồn tại: " + configured);
        }

        Path primary = Paths.get(appDataDir, "models", "u2netp.onnx").normalize();
        if (Files.isRegularFile(primary)) {
            return primary;
        }

        Path devResource = Paths.get("src/main/resources/models/u2netp.onnx").normalize();
        if (Files.isRegularFile(devResource)) {
            return devResource;
        }

        if (modelAutoDownload) {
            return downloadModel(primary);
        }
        throw new IllegalStateException("Thiếu model u2netp.onnx tại " + primary + " — bật ai.media.character.model-auto-download=true hoặc đặt file thủ công");
    }

    private Path downloadModel(Path target) throws Exception {
        if (modelDownloadUrl == null || modelDownloadUrl.isBlank()) {
            throw new IllegalStateException("Không có model và model-download-url trống");
        }
        Files.createDirectories(target.getParent());
        Path tmp = target.resolveSibling(target.getFileName() + ".download");
        log.info("Downloading u2netp ONNX model → {}", target.toAbsolutePath());

        HttpClient client = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(20))
            .build();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(modelDownloadUrl.trim()))
            .timeout(Duration.ofMinutes(5))
            .GET()
            .build();
        HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Download model failed HTTP " + response.statusCode());
        }
        try (InputStream in = response.body()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        log.info("Downloaded u2netp model ({} bytes)", Files.size(target));
        return target;
    }

    private float[][] runMaskInference(BufferedImage rgb) throws OrtException {
        BufferedImage resized = resize(rgb, INPUT_SIZE, INPUT_SIZE);
        float[][][][] input = buildInputTensor(resized);
        long[] shape = {1, 3, INPUT_SIZE, INPUT_SIZE};

        synchronized (sessionLock) {
            try (OnnxTensor tensor = OnnxTensor.createTensor(environment, FloatBuffer.wrap(flatten(input)), shape);
                 OrtSession.Result result = session.run(Map.of(inputName, tensor))) {
                Object value = result.get(0).getValue();
                return extractMask(value);
            }
        }
    }

    private float[][][][] buildInputTensor(BufferedImage image) {
        int w = image.getWidth();
        int h = image.getHeight();
        float maxVal = 0f;
        float[][][] rgb = new float[h][w][3];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int pixel = image.getRGB(x, y);
                float r = (pixel >> 16) & 0xFF;
                float g = (pixel >> 8) & 0xFF;
                float b = pixel & 0xFF;
                rgb[y][x][0] = r;
                rgb[y][x][1] = g;
                rgb[y][x][2] = b;
                maxVal = Math.max(maxVal, Math.max(r, Math.max(g, b)));
            }
        }
        if (maxVal <= 0f) {
            maxVal = 1f;
        }

        float[][][][] tensor = new float[1][3][h][w];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                for (int c = 0; c < 3; c++) {
                    float normalized = (rgb[y][x][c] / maxVal - MEAN[c]) / STD[c];
                    tensor[0][c][y][x] = normalized;
                }
            }
        }
        return tensor;
    }

    private static float[] flatten(float[][][][] tensor) {
        int h = tensor[0][0].length;
        int w = tensor[0][0][0].length;
        float[] flat = new float[3 * h * w];
        int idx = 0;
        for (int c = 0; c < 3; c++) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    flat[idx++] = tensor[0][c][y][x];
                }
            }
        }
        return flat;
    }

    @SuppressWarnings("unchecked")
    private float[][] extractMask(Object value) {
        if (value instanceof float[][][][] arr4) {
            return arr4[0][0];
        }
        if (value instanceof float[][][] arr3) {
            return arr3[0];
        }
        if (value instanceof float[][] arr2) {
            return arr2;
        }
        throw new IllegalStateException("Unexpected ONNX output type: " + value.getClass().getName());
    }

    private static float[][] resizeMask(float[][] mask, int srcW, int srcH, int dstW, int dstH) {
        float[][] out = new float[dstH][dstW];
        for (int y = 0; y < dstH; y++) {
            float sy = (y + 0.5f) * srcH / dstH - 0.5f;
            int y0 = clamp((int) Math.floor(sy), 0, srcH - 1);
            int y1 = clamp(y0 + 1, 0, srcH - 1);
            float fy = sy - y0;
            for (int x = 0; x < dstW; x++) {
                float sx = (x + 0.5f) * srcW / dstW - 0.5f;
                int x0 = clamp((int) Math.floor(sx), 0, srcW - 1);
                int x1 = clamp(x0 + 1, 0, srcW - 1);
                float fx = sx - x0;
                float top = mask[y0][x0] * (1f - fx) + mask[y0][x1] * fx;
                float bottom = mask[y1][x0] * (1f - fx) + mask[y1][x1] * fx;
                float v = top * (1f - fy) + bottom * fy;
                out[y][x] = clamp01(v);
            }
        }
        return out;
    }

    private static BufferedImage applyAlphaMask(BufferedImage rgb, float[][] mask) {
        int w = rgb.getWidth();
        int h = rgb.getHeight();
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int pixel = rgb.getRGB(x, y);
                int alpha = Math.round(clamp01(mask[y][x]) * 255f);
                int argb = (alpha << 24) | (pixel & 0x00FFFFFF);
                out.setRGB(x, y, argb);
            }
        }
        return out;
    }

    private static BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }
        BufferedImage rgb = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = rgb.createGraphics();
        g.drawImage(source, 0, 0, null);
        g.dispose();
        return rgb;
    }

    private static BufferedImage resize(BufferedImage source, int width, int height) {
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(source, 0, 0, width, height, null);
        g.dispose();
        return out;
    }

    private static byte[] toPngBytes(BufferedImage image) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, "png", baos);
        return baos.toByteArray();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static float clamp01(float value) {
        if (value < 0f) return 0f;
        if (value > 1f) return 1f;
        return value;
    }

    private static void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) {
            return;
        }
        try {
            closeable.close();
        } catch (Exception ignored) {
            // ignore
        }
    }
}
