package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Lane 5 — render ảnh/video thật từ kịch bản + ảnh nhân vật (không phải scan-dry-run).
 */
@Service
public class AiMediaScriptRenderService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaScriptRenderService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.render.enabled:true}")
    private boolean renderEnabled;

    @Value("${ai.media.render.default-duration-sec:15}")
    private int defaultDurationSec;

    @Value("${ai.media.render.output-width:1080}")
    private int outputWidth;

    @Value("${ai.media.render.output-height:1920}")
    private int outputHeight;

    @Value("${ai.media.render.max-duration-sec:60}")
    private int maxDurationSec;

    public record RenderRequest(
        String message,
        String outputMode,
        String appId,
        int durationSec,
        byte[] imageBytes,
        String imageMimeType,
        String imageName
    ) {}

    public record RenderResult(
        boolean success,
        String outputMode,
        String imageUrl,
        String videoUrl,
        String imageFileName,
        String videoFileName,
        String message,
        String errorCode
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            out.put("outputMode", outputMode);
            if (imageUrl != null) out.put("imageUrl", imageUrl);
            if (videoUrl != null) out.put("videoUrl", videoUrl);
            if (imageFileName != null) out.put("imageFileName", imageFileName);
            if (videoFileName != null) out.put("videoFileName", videoFileName);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public boolean isEnabled() {
        return renderEnabled;
    }

    public RenderResult render(RenderRequest request) {
        if (!renderEnabled) {
            return fail("RENDER_DISABLED", "AI media render chưa bật (ai.media.render.enabled=false)");
        }
        if (request == null || request.imageBytes() == null || request.imageBytes().length == 0) {
            return fail("MISSING_IMAGE", "Thiếu ảnh nhân vật (attachments[0].base64Data)");
        }
        String script = String.valueOf(request.message() == null ? "" : request.message()).trim();
        if (script.isBlank()) {
            return fail("MISSING_SCRIPT", "Thiếu message (kịch bản)");
        }
        String mode = normalizeMode(request.outputMode());
        String appId = normalizeAppId(request.appId());
        int durationSec = clampDuration(request.durationSec() > 0 ? request.durationSec() : defaultDurationSec);

        try {
            BufferedImage source = ImageIO.read(new ByteArrayInputStream(request.imageBytes()));
            if (source == null) {
                return fail("INVALID_IMAGE", "Không decode được ảnh nhân vật");
            }

            BufferedImage composed = composeStoryboard(source, script);
            Path uploadDir = Paths.get(appDataDir, "public", "app_images", appId);
            Files.createDirectories(uploadDir);

            String stamp = "ai-render-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);
            String imageFileName = stamp + ".jpg";
            Path imagePath = uploadDir.resolve(imageFileName);
            ImageIO.write(composed, "jpg", imagePath.toFile());

            String imageUrl = String.format("app_images/%s/%s", appId, imageFileName);
            String videoUrl = null;
            String videoFileName = null;
            String resultMessage = "Đã render file ảnh vào app_images";

            if ("video".equals(mode) || "both".equals(mode)) {
                videoFileName = stamp + ".mp4";
                Path videoPath = uploadDir.resolve(videoFileName);
                try {
                    encodeSlideshowVideo(imagePath, videoPath, durationSec);
                    videoUrl = String.format("app_images/%s/%s", appId, videoFileName);
                    resultMessage = "Đã render ảnh + video (FFmpeg bundled) vào app_images";
                } catch (Exception videoEx) {
                    log.warn("AI_MEDIA_RENDER video failed appId={} image={}: {}", appId, imageFileName, videoEx.getMessage());
                    videoFileName = null;
                    if ("video".equals(mode)) {
                        throw videoEx;
                    }
                    resultMessage = "Đã render ảnh; video lỗi FFmpeg — " + videoEx.getMessage();
                }
            }

            log.info("AI_MEDIA_RENDER ok appId={} mode={} image={} video={}", appId, mode, imageFileName, videoFileName);
            return new RenderResult(
                true,
                mode,
                imageUrl,
                videoUrl,
                imageFileName,
                videoFileName,
                resultMessage,
                null
            );
        } catch (Exception ex) {
            log.error("AI_MEDIA_RENDER failed: {}", ex.getMessage(), ex);
            return fail("RENDER_FAILED", "Lỗi render media: " + ex.getMessage());
        }
    }

    public byte[] decodeBase64Image(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim();
        if (value.isBlank()) return new byte[0];
        int comma = value.indexOf(',');
        if (value.startsWith("data:") && comma > 0) {
            value = value.substring(comma + 1);
        }
        return Base64.getDecoder().decode(value.replaceAll("\\s+", ""));
    }

    private BufferedImage composeStoryboard(BufferedImage source, String script) {
        int w = Math.max(720, outputWidth);
        int h = Math.max(1280, outputHeight);
        BufferedImage canvas = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, w, h);

        int textBandHeight = (int) (h * 0.32);
        int imageAreaHeight = h - textBandHeight;

        double scale = Math.max((double) w / source.getWidth(), (double) imageAreaHeight / source.getHeight());
        int drawW = (int) Math.round(source.getWidth() * scale);
        int drawH = (int) Math.round(source.getHeight() * scale);
        int drawX = (w - drawW) / 2;
        int drawY = Math.max(0, (imageAreaHeight - drawH) / 2);
        g.drawImage(source, drawX, drawY, drawW, drawH, null);

        int gradientY = imageAreaHeight - 80;
        g.setPaint(new GradientPaint(0, gradientY, new Color(0, 0, 0, 0), 0, imageAreaHeight, new Color(0, 0, 0, 210)));
        g.fillRect(0, gradientY, w, imageAreaHeight - gradientY + 10);

        g.setPaint(new GradientPaint(0, imageAreaHeight, new Color(15, 23, 42), 0, h, new Color(2, 6, 23)));
        g.fillRect(0, imageAreaHeight, w, textBandHeight);

        g.setColor(new Color(248, 250, 252));
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, Math.max(28, w / 34)));
        String headline = extractHeadline(script);
        drawWrappedText(g, headline, 36, imageAreaHeight + 48, w - 72, 2, 38);

        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, Math.max(22, w / 46)));
        g.setColor(new Color(203, 213, 225));
        drawWrappedText(g, script, 36, imageAreaHeight + 120, w - 72, 5, 30);

        g.dispose();
        return canvas;
    }

    private void drawWrappedText(Graphics2D g, String text, int x, int y, int maxWidth, int maxLines, int lineHeight) {
        if (text == null || text.isBlank()) return;
        FontMetrics fm = g.getFontMetrics();
        List<String> lines = wrapText(text, fm, maxWidth, maxLines);
        int cursorY = y;
        for (String line : lines) {
            g.drawString(line, x, cursorY);
            cursorY += lineHeight;
        }
    }

    private List<String> wrapText(String text, FontMetrics fm, int maxWidth, int maxLines) {
        List<String> lines = new ArrayList<>();
        String[] words = text.replace('\n', ' ').trim().split("\\s+");
        StringBuilder current = new StringBuilder();
        for (String word : words) {
            String candidate = current.isEmpty() ? word : current + " " + word;
            if (fm.stringWidth(candidate) <= maxWidth) {
                current = new StringBuilder(candidate);
            } else {
                if (!current.isEmpty()) {
                    lines.add(current.toString());
                    if (lines.size() >= maxLines) break;
                }
                current = new StringBuilder(word);
            }
        }
        if (lines.size() < maxLines && !current.isEmpty()) {
            lines.add(current.toString());
        }
        return lines;
    }

    private String extractHeadline(String script) {
        String firstLine = script.lines().findFirst().orElse(script).trim();
        if (firstLine.length() > 72) {
            return firstLine.substring(0, 69) + "...";
        }
        return firstLine;
    }

    private void encodeSlideshowVideo(Path imagePath, Path videoPath, int durationSec) throws Exception {
        if (bundledFfmpegService == null || !bundledFfmpegService.isReady()) {
            throw new IllegalStateException("FFmpeg bundled (jave-all-deps) chưa sẵn sàng trên server");
        }
        bundledFfmpegService.imageToMp4(imagePath, videoPath, durationSec);
    }

    private String normalizeMode(String raw) {
        String mode = String.valueOf(raw == null ? "both" : raw).trim().toLowerCase(Locale.ROOT);
        return switch (mode) {
            case "image", "video", "both" -> mode;
            default -> "both";
        };
    }

    private String normalizeAppId(String raw) {
        String appId = String.valueOf(raw == null ? "csm" : raw).trim();
        if (appId.isBlank()) appId = "csm";
        return appId.replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private int clampDuration(int durationSec) {
        return Math.max(3, Math.min(maxDurationSec, durationSec));
    }

    private RenderResult fail(String code, String message) {
        return new RenderResult(false, "", null, null, null, null, message, code);
    }
}
