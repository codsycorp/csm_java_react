package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class AiMediaTemplateProRenderService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaTemplateProRenderService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Autowired(required = false)
    private AiMediaStoryboardPlannerService storyboardPlannerService;

    @Autowired(required = false)
    private AiCharacterExtractService characterExtractService;

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.render.enabled:true}")
    private boolean renderEnabled;

    @Value("${ai.media.render.output-width:1080}")
    private int outputWidth;

    @Value("${ai.media.render.output-height:1920}")
    private int outputHeight;

    @Value("${ai.media.render.max-duration-sec:60}")
    private int maxDurationSec;

    public record TemplateProRequest(
        String script,
        String outputMode,
        String appId,
        int durationSec,
        byte[] imageBytes,
        String imageMime,
        List<Map<String, Object>> storyboardScenes,
        byte[] characterCutoutPng
    ) {}

    public record TemplateProResult(
        boolean success,
        String renderEngine,
        String imageUrl,
        String videoUrl,
        List<String> sceneImageUrls,
        Map<String, Object> storyboard,
        Map<String, Object> character,
        String message,
        String errorCode
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            out.put("renderEngine", renderEngine);
            if (imageUrl != null) out.put("imageUrl", imageUrl);
            if (videoUrl != null) out.put("videoUrl", videoUrl);
            if (sceneImageUrls != null) out.put("sceneImageUrls", sceneImageUrls);
            if (storyboard != null) out.put("storyboard", storyboard);
            if (character != null) out.put("character", character);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public TemplateProResult render(TemplateProRequest request) {
        if (!renderEnabled) {
            return fail("RENDER_DISABLED", "Media render tắt");
        }
        if (request == null || request.imageBytes() == null || request.imageBytes().length == 0) {
            return fail("MISSING_IMAGE", "Thiếu ảnh nhân vật");
        }
        String script = String.valueOf(request.script() == null ? "" : request.script()).trim();
        if (script.isBlank()) {
            return fail("MISSING_SCRIPT", "Thiếu kịch bản");
        }
        String appId = normalizeAppId(request.appId());
        String mode = normalizeMode(request.outputMode());
        int targetDuration = clampDuration(request.durationSec() > 0 ? request.durationSec() : 15);

        try {
            AiMediaStoryboardPlannerService.StoryboardPlan plan;
            if (request.storyboardScenes() != null && !request.storyboardScenes().isEmpty()) {
                plan = new AiMediaStoryboardPlannerService.StoryboardPlan(
                    true,
                    script.lines().findFirst().orElse("Video").trim(),
                    "9:16",
                    targetDuration,
                    request.storyboardScenes(),
                    "client",
                    "Storyboard từ client"
                );
            } else if (storyboardPlannerService != null && storyboardPlannerService.isEnabled()) {
                plan = storyboardPlannerService.plan(script, "", targetDuration);
            } else {
                return fail("PLANNER_UNAVAILABLE", "Storyboard planner không khả dụng");
            }
            if (!plan.success() || plan.scenes().isEmpty()) {
                return fail("PLAN_FAILED", plan.message() != null ? plan.message() : "Không tạo được storyboard");
            }

            BufferedImage character;
            Map<String, Object> characterMeta = new LinkedHashMap<>();
            if (request.characterCutoutPng() != null && request.characterCutoutPng().length > 0) {
                character = ImageIO.read(new java.io.ByteArrayInputStream(request.characterCutoutPng()));
                characterMeta.put("method", "provided");
                characterMeta.put("hasAlpha", character != null && character.getColorModel().hasAlpha());
            } else if (characterExtractService != null && characterExtractService.isEnabled()) {
                AiCharacterExtractService.ExtractResult ext = characterExtractService.extract(
                    request.imageBytes(), request.imageMime(), appId);
                characterMeta.putAll(ext.toMap());
                if (!ext.success()) {
                    return fail(ext.errorCode(), ext.message());
                }
                Path cutoutPath = Paths.get(appDataDir, "public", "app_images", appId, ext.cutoutFileName());
                character = ImageIO.read(cutoutPath.toFile());
            } else {
                character = ImageIO.read(new java.io.ByteArrayInputStream(request.imageBytes()));
                characterMeta.put("method", "original");
                characterMeta.put("hasAlpha", false);
            }
            if (character == null) {
                return fail("INVALID_CHARACTER", "Không đọc được ảnh nhân vật");
            }

            Path uploadDir = Paths.get(appDataDir, "public", "app_images", appId);
            Files.createDirectories(uploadDir);
            String stamp = "ai-pro-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);

            List<String> sceneUrls = new ArrayList<>();
            List<Path> sceneImages = new ArrayList<>();
            List<Path> sceneClips = new ArrayList<>();

            int sceneIdx = 0;
            for (Map<String, Object> scene : plan.scenes()) {
                sceneIdx++;
                String narration = str(scene.get("narration"));
                String placement = str(scene.get("characterPlacement"));
                String theme = str(scene.get("backgroundTheme"));
                int sceneSec = clampSceneSec(parseInt(scene.get("durationSec"), 5));

                BufferedImage frame = composeScene(character, narration, placement, theme, sceneIdx);
                String sceneFile = stamp + "-scene-" + sceneIdx + ".jpg";
                Path scenePath = uploadDir.resolve(sceneFile);
                ImageIO.write(frame, "jpg", scenePath.toFile());
                sceneImages.add(scenePath);
                sceneUrls.add(String.format("app_images/%s/%s", appId, sceneFile));

                if (("video".equals(mode) || "both".equals(mode)) && bundledFfmpegService != null && bundledFfmpegService.isReady()) {
                    Path clipPath = uploadDir.resolve(stamp + "-clip-" + sceneIdx + ".mp4");
                    bundledFfmpegService.imageKenBurnsToMp4(scenePath, clipPath, sceneSec);
                    sceneClips.add(clipPath);
                }
            }

            String coverUrl = sceneUrls.isEmpty() ? null : sceneUrls.get(0);
            String videoUrl = null;
            String resultMessage = "Template Pro: " + sceneUrls.size() + " cảnh";

            if (("video".equals(mode) || "both".equals(mode)) && !sceneClips.isEmpty()) {
                Path finalVideo = uploadDir.resolve(stamp + ".mp4");
                if (sceneClips.size() == 1) {
                    Files.copy(sceneClips.get(0), finalVideo, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } else {
                    bundledFfmpegService.concatMp4Clips(sceneClips, finalVideo);
                }
                videoUrl = String.format("app_images/%s/%s", appId, stamp + ".mp4");
                resultMessage += " + video ghép";
                for (Path clip : sceneClips) {
                    try { Files.deleteIfExists(clip); } catch (Exception ignored) { }
                }
            }

            log.info("TEMPLATE_PRO ok appId={} scenes={} video={}", appId, sceneUrls.size(), videoUrl != null);

            return new TemplateProResult(
                true,
                "template_pro",
                "both".equals(mode) || "image".equals(mode) ? coverUrl : null,
                videoUrl,
                sceneUrls,
                plan.toMap(),
                characterMeta,
                resultMessage,
                null
            );
        } catch (Exception ex) {
            log.error("TEMPLATE_PRO failed: {}", ex.getMessage(), ex);
            return fail("RENDER_FAILED", ex.getMessage());
        }
    }

    private BufferedImage composeScene(
        BufferedImage character,
        String narration,
        String placement,
        String theme,
        int sceneIndex
    ) {
        int w = Math.max(720, outputWidth);
        int h = Math.max(1280, outputHeight);
        BufferedImage canvas = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        paintBackground(g, w, h, theme, sceneIndex);

        int margin = (int) (w * 0.06);
        int textBand = (int) (h * 0.28);
        int stageH = h - textBand;

        int charMaxH = (int) (stageH * 0.88);
        int charMaxW = (int) (w * 0.52);
        double scale = Math.min((double) charMaxW / character.getWidth(), (double) charMaxH / character.getHeight());
        int cw = (int) Math.round(character.getWidth() * scale);
        int ch = (int) Math.round(character.getHeight() * scale);
        int cy = margin + (stageH - ch) / 2;
        int cx;
        String p = placement.toLowerCase(Locale.ROOT);
        if (p.contains("right")) {
            cx = w - margin - cw;
        } else if (p.contains("center")) {
            cx = (w - cw) / 2;
        } else {
            cx = margin;
        }

        g.setComposite(AlphaComposite.SrcOver);
        g.drawImage(character, cx, cy, cw, ch, null);

        g.setPaint(new GradientPaint(0, stageH - 60, new Color(0, 0, 0, 0), 0, stageH, new Color(0, 0, 0, 180)));
        g.fillRect(0, stageH - 60, w, 80);
        g.setPaint(new GradientPaint(0, stageH, new Color(15, 23, 42), 0, h, new Color(2, 6, 23)));
        g.fillRect(0, stageH, w, textBand);

        g.setColor(new Color(255, 255, 255, 230));
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, Math.max(26, w / 38)));
        drawWrapped(g, "Cảnh " + sceneIndex, margin, stageH + 44, w - 2 * margin, 1, 34);

        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, Math.max(22, w / 46)));
        g.setColor(new Color(226, 232, 240));
        drawWrapped(g, narration, margin, stageH + 88, w - 2 * margin, 4, 32);

        g.dispose();
        return canvas;
    }

    private void paintBackground(Graphics2D g, int w, int h, String theme, int sceneIndex) {
        Color top;
        Color bottom;
        switch (String.valueOf(theme).toLowerCase(Locale.ROOT)) {
            case "urban" -> {
                top = new Color(30, 41, 59);
                bottom = new Color(51, 65, 85);
            }
            case "nature" -> {
                top = new Color(20, 83, 45);
                bottom = new Color(6, 78, 59);
            }
            case "office" -> {
                top = new Color(30, 58, 138);
                bottom = new Color(15, 23, 42);
            }
            case "warm" -> {
                top = new Color(154, 52, 18);
                bottom = new Color(69, 26, 3);
            }
            default -> {
                top = new Color(88, 28, 135);
                bottom = new Color(30, 27, 75);
            }
        }
        float shift = (sceneIndex % 3) * 0.08f;
        g.setPaint(new GradientPaint(0, 0, brighten(top, shift), w, h, darken(bottom, shift)));
        g.fillRect(0, 0, w, h);

        g.setColor(new Color(255, 255, 255, 18));
        for (int i = 0; i < 6; i++) {
            int rw = w / 4 + (i * 37) % (w / 5);
            int rh = h / 6;
            int rx = (i * 113 + sceneIndex * 47) % (w - rw);
            int ry = (i * 89) % (h / 2);
            g.fillRoundRect(rx, ry, rw, rh, 24, 24);
        }
    }

    private Color brighten(Color c, float f) {
        return new Color(
            clamp255(c.getRed() + (int) (40 * f)),
            clamp255(c.getGreen() + (int) (40 * f)),
            clamp255(c.getBlue() + (int) (40 * f)));
    }

    private Color darken(Color c, float f) {
        return new Color(
            clamp255(c.getRed() - (int) (30 * f)),
            clamp255(c.getGreen() - (int) (30 * f)),
            clamp255(c.getBlue() - (int) (30 * f)));
    }

    private int clamp255(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private void drawWrapped(Graphics2D g, String text, int x, int y, int maxW, int maxLines, int lineH) {
        if (text == null || text.isBlank()) return;
        FontMetrics fm = g.getFontMetrics();
        List<String> lines = new ArrayList<>();
        String[] words = text.replace('\n', ' ').trim().split("\\s+");
        StringBuilder cur = new StringBuilder();
        for (String word : words) {
            String cand = cur.isEmpty() ? word : cur + " " + word;
            if (fm.stringWidth(cand) <= maxW) {
                cur = new StringBuilder(cand);
            } else {
                if (!cur.isEmpty()) {
                    lines.add(cur.toString());
                    if (lines.size() >= maxLines) break;
                }
                cur = new StringBuilder(word);
            }
        }
        if (lines.size() < maxLines && !cur.isEmpty()) lines.add(cur.toString());
        int cy = y;
        for (String line : lines) {
            g.drawString(line, x, cy);
            cy += lineH;
        }
    }

    private String str(Object o) {
        return String.valueOf(o == null ? "" : o).trim();
    }

    private int parseInt(Object o, int def) {
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return def;
        }
    }

    private int clampSceneSec(int sec) {
        return Math.max(3, Math.min(12, sec));
    }

    private int clampDuration(int d) {
        return Math.max(9, Math.min(maxDurationSec, d));
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

    private TemplateProResult fail(String code, String message) {
        return new TemplateProResult(false, "template_pro", null, null, List.of(), null, null, message, code);
    }
}
