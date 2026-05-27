package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
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
 * Võ thuật cinematic — cutout user + Java2D rooftop compositing + FFmpeg motion presets.
 */
@Service
public class AiMediaMartialCinematicRenderService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaMartialCinematicRenderService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Autowired(required = false)
    private AiCharacterExtractService characterExtractService;

    @Autowired(required = false)
    private MartialSceneCompositor martialSceneCompositor;

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.render.enabled:true}")
    private boolean renderEnabled;

    @Value("${ai.media.martial.enabled:true}")
    private boolean martialEnabled;

    @Value("${ai.media.render.max-duration-sec:60}")
    private int maxDurationSec;

    public record MartialRequest(
        String script,
        String outputMode,
        String appId,
        int durationSec,
        byte[] imageBytes,
        String imageMime,
        List<Map<String, Object>> storyboardScenes
    ) {}

    public record MartialResult(
        boolean success,
        String renderEngine,
        String imageUrl,
        String videoUrl,
        List<String> sceneImageUrls,
        Map<String, Object> storyboard,
        Map<String, Object> character,
        String tiktokCaption,
        List<String> hashtags,
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
            if (tiktokCaption != null) out.put("tiktokCaption", tiktokCaption);
            if (hashtags != null) out.put("hashtags", hashtags);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public boolean isEnabled() {
        return renderEnabled && martialEnabled;
    }

    public MartialStoryboardTemplates.MartialPlan planStoryboard(String script, int durationSec) {
        return MartialStoryboardTemplates.buildPlan(script, durationSec);
    }

    public MartialResult render(MartialRequest request) {
        if (!isEnabled()) {
            return fail("MARTIAL_DISABLED", "Martial cinematic tắt (ai.media.martial.enabled=false)");
        }
        if (martialSceneCompositor == null) {
            return fail("COMPOSITOR_UNAVAILABLE", "MartialSceneCompositor không khả dụng");
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
        int targetDuration = clampDuration(request.durationSec() > 0 ? request.durationSec() : 18);

        try {
            MartialStoryboardTemplates.MartialPlan plan;
            if (request.storyboardScenes() != null && !request.storyboardScenes().isEmpty()) {
                plan = MartialStoryboardTemplates.buildPlan(script, targetDuration);
                plan = new MartialStoryboardTemplates.MartialPlan(
                    true, plan.title(), plan.aspectRatio(), plan.totalDurationSec(),
                    request.storyboardScenes(), plan.tiktokCaption(), plan.hashtags(), plan.message()
                );
            } else {
                plan = MartialStoryboardTemplates.buildPlan(script, targetDuration);
            }
            if (!plan.success() || plan.scenes().isEmpty()) {
                return fail("PLAN_FAILED", "Không tạo được martial storyboard");
            }

            Path cutoutPath;
            Map<String, Object> characterMeta = new LinkedHashMap<>();
            if (characterExtractService != null && characterExtractService.isEnabled()) {
                AiCharacterExtractService.ExtractResult ext = characterExtractService.extract(
                    request.imageBytes(), request.imageMime(), appId);
                characterMeta.putAll(ext.toMap());
                if (!ext.success()) {
                    return fail(ext.errorCode(), ext.message());
                }
                cutoutPath = Paths.get(appDataDir, "public", "app_images", appId, ext.cutoutFileName());
            } else {
                Path dir = Paths.get(appDataDir, "public", "app_images", appId);
                Files.createDirectories(dir);
                String fileName = "ai-martial-src-" + System.currentTimeMillis() + ".png";
                cutoutPath = dir.resolve(fileName);
                Files.write(cutoutPath, request.imageBytes());
                characterMeta.put("method", "passthrough");
                characterMeta.put("cutoutFileName", fileName);
            }

            Path uploadDir = Paths.get(appDataDir, "public", "app_images", appId);
            Files.createDirectories(uploadDir);
            String stamp = "ai-martial-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);

            List<String> sceneUrls = new ArrayList<>();
            List<Path> sceneClips = new ArrayList<>();
            int sceneIdx = 0;

            for (Map<String, Object> scene : plan.scenes()) {
                sceneIdx++;
                String sceneId = str(scene.get("sceneId"));
                if (sceneId.isBlank()) sceneId = "scene_" + sceneIdx;
                String caption = str(scene.get("dialogue"));
                if (caption.isBlank()) caption = str(scene.get("narration"));
                String motionPreset = str(scene.get("motionPreset"));
                if (motionPreset.isBlank()) motionPreset = "dolly_up";
                int sceneSec = clampSceneSec(parseInt(scene.get("durationSec"), 4));
                int frameCount = Math.max(1, parseInt(scene.get("frameCount"), 1));

                if ("pose_sequence".equals(motionPreset) || "combo".equals(sceneId)) {
                    List<Path> frames = new ArrayList<>();
                    for (int fi = 0; fi < frameCount; fi++) {
                        BufferedImage frame = martialSceneCompositor.composeScene(
                            sceneId, cutoutPath, caption, sceneIdx, fi, frameCount);
                        String frameFile = stamp + "-s" + sceneIdx + "-f" + fi + ".jpg";
                        Path framePath = uploadDir.resolve(frameFile);
                        ImageIO.write(frame, "jpg", framePath.toFile());
                        frames.add(framePath);
                        if (fi == 0 || fi == frameCount - 1) {
                            sceneUrls.add(String.format("app_images/%s/%s", appId, frameFile));
                        }
                    }
                    if (("video".equals(mode) || "both".equals(mode)) && bundledFfmpegService != null && bundledFfmpegService.isReady()) {
                        Path clipPath = uploadDir.resolve(stamp + "-clip-" + sceneIdx + ".mp4");
                        bundledFfmpegService.martialPoseSequenceToMp4(frames, clipPath, sceneSec);
                        sceneClips.add(clipPath);
                        for (Path fp : frames) {
                            try { Files.deleteIfExists(fp); } catch (Exception ignored) { }
                        }
                    }
                } else {
                    BufferedImage composite = martialSceneCompositor.composeScene(
                        sceneId, cutoutPath, caption, sceneIdx, 0, 1);
                    String previewFile = stamp + "-scene-" + sceneIdx + ".jpg";
                    Path previewPath = uploadDir.resolve(previewFile);
                    ImageIO.write(composite, "jpg", previewPath.toFile());
                    sceneUrls.add(String.format("app_images/%s/%s", appId, previewFile));

                    if (("video".equals(mode) || "both".equals(mode)) && bundledFfmpegService != null && bundledFfmpegService.isReady()) {
                        Path clipPath = uploadDir.resolve(stamp + "-clip-" + sceneIdx + ".mp4");
                        try {
                            bundledFfmpegService.martialSceneToMp4(previewPath, clipPath, sceneSec, motionPreset);
                        } catch (Exception clipEx) {
                            log.warn("martial clip scene {} preset {} failed: {}", sceneIdx, motionPreset, clipEx.getMessage());
                            bundledFfmpegService.imageKenBurnsToMp4(previewPath, clipPath, sceneSec);
                        }
                        sceneClips.add(clipPath);
                    }
                }
            }

            String coverUrl = sceneUrls.isEmpty() ? null : sceneUrls.get(sceneUrls.size() - 1);
            String videoUrl = null;
            String resultMessage = "Martial cinematic: " + sceneUrls.size() + " preview frame(s), "
                + sceneClips.size() + " clip(s) · " + plan.totalDurationSec() + "s";

            if (("video".equals(mode) || "both".equals(mode)) && !sceneClips.isEmpty()) {
                Path rawVideo = uploadDir.resolve(stamp + "-raw.mp4");
                if (sceneClips.size() == 1) {
                    Files.copy(sceneClips.get(0), rawVideo, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } else {
                    bundledFfmpegService.concatMp4Clips(sceneClips, rawVideo);
                }
                Path finalVideo = uploadDir.resolve(stamp + ".mp4");
                try {
                    bundledFfmpegService.applyCinematicGrade(rawVideo, finalVideo);
                    Files.deleteIfExists(rawVideo);
                } catch (Exception gradeEx) {
                    log.warn("cinematic grade failed, use raw concat: {}", gradeEx.getMessage());
                    Files.move(rawVideo, finalVideo, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                }
                videoUrl = String.format("app_images/%s/%s", appId, stamp + ".mp4");
                for (Path clip : sceneClips) {
                    try { Files.deleteIfExists(clip); } catch (Exception ignored) { }
                }
            }

            log.info("MARTIAL_CINEMATIC ok appId={} scenes={} video={}", appId, plan.scenes().size(), videoUrl != null);

            return new MartialResult(
                true,
                "martial_cinematic",
                "both".equals(mode) || "image".equals(mode) ? coverUrl : null,
                videoUrl,
                sceneUrls,
                plan.toMap(),
                characterMeta,
                plan.tiktokCaption(),
                plan.hashtags(),
                resultMessage,
                null
            );
        } catch (Exception ex) {
            log.error("MARTIAL_CINEMATIC failed: {}", ex.getMessage(), ex);
            return fail("RENDER_FAILED", ex.getMessage());
        }
    }

    private MartialResult fail(String code, String message) {
        return new MartialResult(false, "martial_cinematic", null, null, null, null, null, null, null, message, code);
    }

    private String normalizeAppId(String appId) {
        String v = String.valueOf(appId == null ? "csm" : appId).trim();
        return v.isBlank() ? "csm" : v.replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private String normalizeMode(String mode) {
        String m = String.valueOf(mode == null ? "both" : mode).trim().toLowerCase(Locale.ROOT);
        return switch (m) {
            case "image", "video" -> m;
            default -> "both";
        };
    }

    private int clampDuration(int sec) {
        return Math.max(12, Math.min(maxDurationSec, sec));
    }

    private int clampSceneSec(int sec) {
        return Math.max(2, Math.min(12, sec));
    }

    private int parseInt(Object v, int def) {
        if (v == null) return def;
        try {
            if (v instanceof Number n) return n.intValue();
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception ex) {
            return def;
        }
    }

    private String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
