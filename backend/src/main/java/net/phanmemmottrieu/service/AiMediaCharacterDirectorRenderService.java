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
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Character Director — Vision/LLM nhận diện nhân vật + storyboard hành động + FFmpeg animate cutout theo kịch bản.
 * Khác template_pro: nhân vật là layer riêng chuyển động (nói, bước vào, chỉ tay), không Ken Burns cả khung có sẵn nhân vật.
 */
@Service
public class AiMediaCharacterDirectorRenderService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaCharacterDirectorRenderService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Autowired(required = false)
    private AiMediaStoryboardPlannerService storyboardPlannerService;

    @Autowired(required = false)
    private AiCharacterExtractService characterExtractService;

    @Autowired(required = false)
    private AiCharacterProfileService characterProfileService;

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

    public record DirectorRequest(
        String script,
        String outputMode,
        String appId,
        int durationSec,
        byte[] imageBytes,
        String imageMime,
        List<Map<String, Object>> storyboardScenes,
        byte[] characterCutoutPng
    ) {}

    public record DirectorResult(
        boolean success,
        String renderEngine,
        String imageUrl,
        String videoUrl,
        List<String> sceneImageUrls,
        Map<String, Object> storyboard,
        Map<String, Object> character,
        Map<String, Object> characterProfile,
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
            if (characterProfile != null) out.put("characterProfile", characterProfile);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public DirectorResult render(DirectorRequest request) {
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
            Map<String, Object> characterProfile = characterProfileService != null
                ? characterProfileService.analyze(request.imageBytes(), request.imageMime(), script)
                : Map.of("role", "presenter");

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
                plan = storyboardPlannerService.plan(script, String.valueOf(characterProfile.get("directorHint")), targetDuration, characterProfile);
            } else {
                return fail("PLANNER_UNAVAILABLE", "Storyboard planner không khả dụng");
            }
            if (!plan.success() || plan.scenes().isEmpty()) {
                return fail("PLAN_FAILED", plan.message() != null ? plan.message() : "Không tạo được storyboard");
            }

            Path cutoutPath;
            Map<String, Object> characterMeta = new LinkedHashMap<>();
            if (request.characterCutoutPng() != null && request.characterCutoutPng().length > 0) {
                Path dir = Paths.get(appDataDir, "public", "app_images", appId);
                Files.createDirectories(dir);
                String fileName = "ai-char-inline-" + System.currentTimeMillis() + ".png";
                cutoutPath = dir.resolve(fileName);
                Files.write(cutoutPath, request.characterCutoutPng());
                characterMeta.put("method", "provided");
                characterMeta.put("cutoutFileName", fileName);
            } else if (characterExtractService != null && characterExtractService.isEnabled()) {
                AiCharacterExtractService.ExtractResult ext = characterExtractService.extract(
                    request.imageBytes(), request.imageMime(), appId);
                characterMeta.putAll(ext.toMap());
                if (!ext.success()) {
                    return fail(ext.errorCode(), ext.message());
                }
                cutoutPath = Paths.get(appDataDir, "public", "app_images", appId, ext.cutoutFileName());
            } else {
                return fail("EXTRACT_UNAVAILABLE", "Character extract không khả dụng");
            }

            Path uploadDir = Paths.get(appDataDir, "public", "app_images", appId);
            Files.createDirectories(uploadDir);
            String stamp = "ai-dir-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);

            List<String> sceneUrls = new ArrayList<>();
            List<Path> sceneClips = new ArrayList<>();
            int sceneIdx = 0;

            for (Map<String, Object> scene : plan.scenes()) {
                sceneIdx++;
                String dialogue = str(scene.get("dialogue"));
                if (dialogue.isBlank()) dialogue = str(scene.get("narration"));
                String visualPrompt = str(scene.get("visualPrompt"));
                String characterAction = str(scene.get("characterAction"));
                String shotType = str(scene.get("shotType"));
                String placement = str(scene.get("characterPlacement"));
                String theme = str(scene.get("backgroundTheme"));
                int sceneSec = clampSceneSec(parseInt(scene.get("durationSec"), 5));

                BufferedImage bg = composeSceneBackground(dialogue, visualPrompt, theme, sceneIdx);
                String bgFile = stamp + "-bg-" + sceneIdx + ".jpg";
                Path bgPath = uploadDir.resolve(bgFile);
                ImageIO.write(bg, "jpg", bgPath.toFile());

                String previewFile = stamp + "-scene-" + sceneIdx + ".jpg";
                Path previewPath = uploadDir.resolve(previewFile);
                BufferedImage preview = composePreviewWithCharacter(bg, cutoutPath, placement, shotType);
                ImageIO.write(preview, "jpg", previewPath.toFile());
                sceneUrls.add(String.format("app_images/%s/%s", appId, previewFile));

                if (("video".equals(mode) || "both".equals(mode)) && bundledFfmpegService != null && bundledFfmpegService.isReady()) {
                    Path clipPath = uploadDir.resolve(stamp + "-clip-" + sceneIdx + ".mp4");
                    try {
                        bundledFfmpegService.presenterSceneToMp4(
                            bgPath, cutoutPath, clipPath, sceneSec, characterAction, shotType, placement);
                    } catch (Exception clipEx) {
                        log.warn("presenter clip scene {} overlay failed, fallback preview mp4: {}", sceneIdx, clipEx.getMessage());
                        bundledFfmpegService.imageToMp4(previewPath, clipPath, sceneSec);
                    }
                    sceneClips.add(clipPath);
                }
            }

            String coverUrl = sceneUrls.isEmpty() ? null : sceneUrls.get(0);
            String videoUrl = null;
            String resultMessage = "Character Director: " + sceneUrls.size() + " cảnh, nhân vật animate theo kịch bản";

            if (("video".equals(mode) || "both".equals(mode)) && !sceneClips.isEmpty()) {
                Path finalVideo = uploadDir.resolve(stamp + ".mp4");
                if (sceneClips.size() == 1) {
                    Files.copy(sceneClips.get(0), finalVideo, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } else {
                    bundledFfmpegService.concatMp4Clips(sceneClips, finalVideo);
                }
                videoUrl = String.format("app_images/%s/%s", appId, stamp + ".mp4");
                resultMessage += " · " + plan.totalDurationSec() + "s";
                for (Path clip : sceneClips) {
                    try { Files.deleteIfExists(clip); } catch (Exception ignored) { }
                }
            }

            log.info("CHARACTER_DIRECTOR ok appId={} scenes={} video={} profile={}",
                appId, sceneUrls.size(), videoUrl != null, characterProfile.get("source"));

            Map<String, Object> storyboardOut = plan.toMap();
            storyboardOut.put("characterProfile", characterProfile);

            return new DirectorResult(
                true,
                "character_director",
                "both".equals(mode) || "image".equals(mode) ? coverUrl : null,
                videoUrl,
                sceneUrls,
                storyboardOut,
                characterMeta,
                characterProfile,
                resultMessage,
                null
            );
        } catch (Exception ex) {
            log.error("CHARACTER_DIRECTOR failed: {}", ex.getMessage(), ex);
            return fail("RENDER_FAILED", ex.getMessage());
        }
    }

    private BufferedImage composePreviewWithCharacter(BufferedImage bg, Path cutoutPath, String placement, String shotType) throws Exception {
        BufferedImage character = ImageIO.read(cutoutPath.toFile());
        int w = bg.getWidth();
        int h = bg.getHeight();
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.drawImage(bg, 0, 0, null);
        if (character != null) {
            int charMaxW = switch (String.valueOf(shotType).toLowerCase()) {
                case "closeup" -> (int) (w * 0.58);
                case "wide" -> (int) (w * 0.36);
                default -> (int) (w * 0.45);
            };
            double scale = Math.min((double) charMaxW / character.getWidth(), (double) (h * 0.55) / character.getHeight());
            int cw = (int) Math.round(character.getWidth() * scale);
            int ch = (int) Math.round(character.getHeight() * scale);
            int cy = (int) (h * 0.52) - ch / 2;
            int cx = resolveCharacterX(w, cw, placement);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(character, cx, cy, cw, ch, null);
        }
        g.dispose();
        return out;
    }

    private int resolveCharacterX(int canvasW, int charW, String placement) {
        String p = String.valueOf(placement).toLowerCase(Locale.ROOT);
        int margin = (int) (canvasW * 0.08);
        if (p.contains("right")) return canvasW - margin - charW;
        if (p.contains("center")) return (canvasW - charW) / 2;
        return margin;
    }

    private BufferedImage composeSceneBackground(String dialogue, String visualPrompt, String theme, int sceneIndex) {
        int w = Math.max(720, outputWidth);
        int h = Math.max(1280, outputHeight);
        BufferedImage canvas = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        paintBackground(g, w, h, theme, sceneIndex);

        int margin = (int) (w * 0.06);
        int textBand = (int) (h * 0.32);
        int stageH = h - textBand;

        g.setColor(new Color(255, 255, 255, 40));
        g.setFont(new Font(Font.SANS_SERIF, Font.ITALIC, Math.max(18, w / 56)));
        drawWrapped(g, visualPrompt, margin, stageH - 36, w - 2 * margin, 1, 24);

        g.setPaint(new GradientPaint(0, stageH, new Color(15, 23, 42), 0, h, new Color(2, 6, 23)));
        g.fillRect(0, stageH, w, textBand);

        g.setColor(new Color(250, 204, 21));
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, Math.max(22, w / 44)));
        drawWrapped(g, "Cảnh " + sceneIndex, margin, stageH + 42, w - 2 * margin, 1, 30);

        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, Math.max(24, w / 42)));
        g.setColor(new Color(241, 245, 249));
        drawWrapped(g, "「" + dialogue + "」", margin, stageH + 86, w - 2 * margin, 4, 34);

        g.dispose();
        return canvas;
    }

    private void paintBackground(Graphics2D g, int w, int h, String theme, int sceneIndex) {
        Color top;
        Color bottom;
        switch (String.valueOf(theme).toLowerCase(Locale.ROOT)) {
            case "urban" -> { top = new Color(30, 41, 59); bottom = new Color(51, 65, 85); }
            case "nature" -> { top = new Color(20, 83, 45); bottom = new Color(6, 78, 59); }
            case "office" -> { top = new Color(30, 58, 138); bottom = new Color(15, 23, 42); }
            case "warm" -> { top = new Color(154, 52, 18); bottom = new Color(69, 26, 3); }
            default -> { top = new Color(88, 28, 135); bottom = new Color(30, 27, 75); }
        }
        float shift = (sceneIndex % 3) * 0.08f;
        g.setPaint(new GradientPaint(0, 0, brighten(top, shift), w, h, darken(bottom, shift)));
        g.fillRect(0, 0, w, h);
        g.setColor(new Color(255, 255, 255, 22));
        for (int i = 0; i < 8; i++) {
            int rw = w / 4 + (i * 41) % (w / 5);
            int rh = h / 7;
            int rx = (i * 127 + sceneIndex * 53) % Math.max(1, w - rw);
            int ry = (i * 97) % Math.max(1, h / 2);
            g.fillRoundRect(rx, ry, rw, rh, 24, 24);
        }
    }

    private Color brighten(Color c, float f) {
        return new Color(clamp255(c.getRed() + (int) (40 * f)), clamp255(c.getGreen() + (int) (40 * f)), clamp255(c.getBlue() + (int) (40 * f)));
    }

    private Color darken(Color c, float f) {
        return new Color(clamp255(c.getRed() - (int) (30 * f)), clamp255(c.getGreen() - (int) (30 * f)), clamp255(c.getBlue() - (int) (30 * f)));
    }

    private int clamp255(int v) { return Math.max(0, Math.min(255, v)); }

    private void drawWrapped(Graphics2D g, String text, int x, int y, int maxW, int maxLines, int lineH) {
        if (text == null || text.isBlank()) return;
        FontMetrics fm = g.getFontMetrics();
        List<String> lines = new ArrayList<>();
        String[] words = text.replace('\n', ' ').trim().split("\\s+");
        StringBuilder cur = new StringBuilder();
        for (String word : words) {
            String cand = cur.isEmpty() ? word : cur + " " + word;
            if (fm.stringWidth(cand) <= maxW) cur = new StringBuilder(cand);
            else {
                if (!cur.isEmpty()) { lines.add(cur.toString()); if (lines.size() >= maxLines) break; }
                cur = new StringBuilder(word);
            }
        }
        if (lines.size() < maxLines && !cur.isEmpty()) lines.add(cur.toString());
        int cy = y;
        for (String line : lines) { g.drawString(line, x, cy); cy += lineH; }
    }

    private String str(Object o) { return String.valueOf(o == null ? "" : o).trim(); }
    private int parseInt(Object o, int def) {
        try { return Integer.parseInt(String.valueOf(o).trim()); } catch (Exception e) { return def; }
    }
    private int clampSceneSec(int sec) { return Math.max(3, Math.min(12, sec)); }
    private int clampDuration(int d) { return Math.max(9, Math.min(maxDurationSec, d)); }
    private String normalizeMode(String raw) {
        String mode = String.valueOf(raw == null ? "both" : raw).trim().toLowerCase(Locale.ROOT);
        return switch (mode) { case "image", "video", "both" -> mode; default -> "both"; };
    }
    private String normalizeAppId(String raw) {
        String appId = String.valueOf(raw == null ? "csm" : raw).trim();
        if (appId.isBlank()) appId = "csm";
        return appId.replaceAll("[^a-zA-Z0-9_-]", "");
    }
    private DirectorResult fail(String code, String message) {
        return new DirectorResult(false, "character_director", null, null, List.of(), null, null, null, message, code);
    }
}
