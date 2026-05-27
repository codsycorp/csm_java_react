package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
 * S3 Talking Presenter — TTS + talking-head bundled trong backend Java + FFmpeg concat.
 * Nhân vật nói đúng dialogue từng cảnh theo storyboard.
 */
@Service
public class AiMediaTalkingPresenterRenderService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaTalkingPresenterRenderService.class);

    @Autowired(required = false)
    private BundledFfmpegService bundledFfmpegService;

    @Autowired(required = false)
    private AiMediaStoryboardPlannerService storyboardPlannerService;

    @Autowired(required = false)
    private AiCharacterProfileService characterProfileService;

    @Autowired(required = false)
    private AiLocalPiperTtsService piperTtsService;

    @Autowired(required = false)
    private AiLocalTalkingHeadService talkingHeadService;

    @Value("${app.data.dir:./csm_datas}")
    private String appDataDir;

    @Value("${ai.media.render.enabled:true}")
    private boolean renderEnabled;

    @Value("${ai.media.render.max-duration-sec:60}")
    private int maxDurationSec;

    public record PresenterRequest(
        String script,
        String outputMode,
        String appId,
        int durationSec,
        byte[] imageBytes,
        String imageMime,
        List<Map<String, Object>> storyboardScenes
    ) {}

    public record PresenterResult(
        boolean success,
        String renderEngine,
        String imageUrl,
        String videoUrl,
        List<String> sceneVideoUrls,
        Map<String, Object> storyboard,
        Map<String, Object> characterProfile,
        Map<String, Object> tts,
        Map<String, Object> talkingHead,
        String message,
        String errorCode
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            out.put("renderEngine", renderEngine);
            if (imageUrl != null) out.put("imageUrl", imageUrl);
            if (videoUrl != null) out.put("videoUrl", videoUrl);
            if (sceneVideoUrls != null) {
                out.put("sceneVideoUrls", sceneVideoUrls);
                out.put("sceneImageUrls", sceneVideoUrls);
            }
            if (storyboard != null) out.put("storyboard", storyboard);
            if (characterProfile != null) out.put("characterProfile", characterProfile);
            if (tts != null) out.put("tts", tts);
            if (talkingHead != null) out.put("talkingHead", talkingHead);
            if (message != null) out.put("message", message);
            if (errorCode != null) out.put("errorCode", errorCode);
            return out;
        }
    }

    public PresenterResult render(PresenterRequest request) {
        if (!renderEnabled) {
            return fail("RENDER_DISABLED", "Media render tắt");
        }
        if (piperTtsService == null || !piperTtsService.isEnabled()) {
            return fail("TTS_UNAVAILABLE", "TTS local chưa bật — cần macOS say, espeak hoặc Piper model");
        }
        if (talkingHeadService == null || !talkingHeadService.isEnabled()) {
            return fail("TALKING_HEAD_UNAVAILABLE", "Talking-head chưa bật — cần Bundled FFmpeg");
        }
        if (request == null || request.imageBytes() == null || request.imageBytes().length == 0) {
            return fail("MISSING_IMAGE", "Thiếu ảnh nhân vật");
        }
        String script = String.valueOf(request.script() == null ? "" : request.script()).trim();
        if (script.isBlank()) {
            return fail("MISSING_SCRIPT", "Thiếu kịch bản");
        }
        if (bundledFfmpegService == null || !bundledFfmpegService.isReady()) {
            return fail("FFMPEG_UNAVAILABLE", "Bundled FFmpeg chưa sẵn sàng");
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
                    true, script.lines().findFirst().orElse("Video").trim(), "9:16", targetDuration,
                    request.storyboardScenes(), "client", "Storyboard client");
            } else if (storyboardPlannerService != null && storyboardPlannerService.isEnabled()) {
                plan = storyboardPlannerService.plan(script,
                    String.valueOf(characterProfile.get("directorHint")), targetDuration, characterProfile);
            } else {
                return fail("PLANNER_UNAVAILABLE", "Storyboard planner không khả dụng");
            }
            if (!plan.success() || plan.scenes().isEmpty()) {
                return fail("PLAN_FAILED", plan.message() != null ? plan.message() : "Không có cảnh");
            }

            Path uploadDir = Paths.get(appDataDir, "public", "app_images", appId);
            Files.createDirectories(uploadDir);
            String stamp = "ai-talk-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);

            Path portraitPath = uploadDir.resolve(stamp + "-portrait.png");
            Files.write(portraitPath, request.imageBytes());

            List<String> sceneUrls = new ArrayList<>();
            List<Path> sceneClips = new ArrayList<>();
            String ttsMethod = "";
            String talkMethod = "";
            int sceneIdx = 0;

            for (Map<String, Object> scene : plan.scenes()) {
                sceneIdx++;
                String dialogue = str(scene.get("dialogue"));
                if (dialogue.isBlank()) dialogue = str(scene.get("narration"));
                if (dialogue.isBlank()) continue;

                AiLocalPiperTtsService.TtsResult tts = piperTtsService.synthesize(dialogue);
                if (!tts.success() || tts.wavBytes() == null) {
                    return fail("TTS_FAILED", "Cảnh " + sceneIdx + ": " + tts.message());
                }
                ttsMethod = tts.method();

                Path wavPath = uploadDir.resolve(stamp + "-s" + sceneIdx + ".wav");
                Files.write(wavPath, tts.wavBytes());

                AiLocalTalkingHeadService.TalkResult talk = talkingHeadService.animate(
                    request.imageBytes(), tts.wavBytes());
                if (!talk.success() || talk.mp4Bytes() == null) {
                    return fail("TALKING_HEAD_FAILED", "Cảnh " + sceneIdx + ": " + talk.message());
                }
                talkMethod = talk.method();

                String sceneFile = stamp + "-scene-" + sceneIdx + ".mp4";
                Path scenePath = uploadDir.resolve(sceneFile);
                Files.write(scenePath, talk.mp4Bytes());
                sceneUrls.add(String.format("app_images/%s/%s", appId, sceneFile));

                if ("video".equals(mode) || "both".equals(mode)) {
                    sceneClips.add(scenePath);
                }
            }

            if (sceneUrls.isEmpty()) {
                return fail("NO_SCENES", "Không tạo được cảnh nào có dialogue");
            }

            String coverUrl = sceneUrls.get(0);
            String videoUrl = null;
            String resultMessage = "Talking Presenter: " + sceneUrls.size() + " cảnh · TTS=" + ttsMethod + " · talk=" + talkMethod;

            if (("video".equals(mode) || "both".equals(mode)) && !sceneClips.isEmpty()) {
                Path finalVideo = uploadDir.resolve(stamp + ".mp4");
                if (sceneClips.size() == 1) {
                    Files.copy(sceneClips.get(0), finalVideo, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } else {
                    bundledFfmpegService.concatMp4Clips(sceneClips, finalVideo);
                }
                videoUrl = String.format("app_images/%s/%s", appId, stamp + ".mp4");
                resultMessage += " · " + plan.totalDurationSec() + "s target";
            }

            log.info("TALKING_PRESENTER ok appId={} scenes={} tts={} talk={} video={}",
                appId, sceneUrls.size(), ttsMethod, talkMethod, videoUrl != null);

            Map<String, Object> storyboardOut = plan.toMap();
            storyboardOut.put("characterProfile", characterProfile);

            return new PresenterResult(
                true,
                "talking_presenter",
                "both".equals(mode) || "image".equals(mode) ? coverUrl : null,
                videoUrl,
                sceneUrls,
                storyboardOut,
                characterProfile,
                Map.of("method", ttsMethod, "provider", piperTtsService.describeStatus().get("provider")),
                Map.of("method", talkMethod, "provider", talkingHeadService.describeStatus().get("provider")),
                resultMessage,
                null
            );
        } catch (Exception ex) {
            log.error("TALKING_PRESENTER failed: {}", ex.getMessage(), ex);
            return fail("RENDER_FAILED", ex.getMessage());
        }
    }

    private String str(Object o) { return String.valueOf(o == null ? "" : o).trim(); }
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
    private PresenterResult fail(String code, String message) {
        return new PresenterResult(false, "talking_presenter", null, null, List.of(), null, null, null, null, message, code);
    }
}
