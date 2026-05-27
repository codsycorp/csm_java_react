package net.phanmemmottrieu.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Storyboard cố định 4 cảnh cho video võ thuật cinematic — không cần LLM.
 */
public final class MartialStoryboardTemplates {

    private MartialStoryboardTemplates() {
    }

    public record MartialPlan(
        boolean success,
        String title,
        String aspectRatio,
        int totalDurationSec,
        List<Map<String, Object>> scenes,
        String tiktokCaption,
        List<String> hashtags,
        String message
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            out.put("title", title);
            out.put("aspectRatio", aspectRatio);
            out.put("totalDurationSec", totalDurationSec);
            out.put("scenes", scenes);
            out.put("storyboardScenes", scenes);
            out.put("tiktokCaption", tiktokCaption);
            out.put("hashtags", hashtags);
            if (message != null) out.put("message", message);
            out.put("planner", "martial_template");
            out.put("engine", "martial_cinematic");
            return out;
        }
    }

    public static MartialPlan buildPlan(String scriptHint, int targetDurationSec) {
        int total = clamp(targetDurationSec, 15, 20);
        int scene1 = 4;
        int scene2 = 4;
        int scene3 = Math.max(4, total - scene1 - scene2 - 4);
        int scene4 = total - scene1 - scene2 - scene3;
        if (scene4 < 3) {
            scene4 = 4;
            scene3 = total - scene1 - scene2 - scene4;
        }

        String hook = extractHook(scriptHint);
        List<Map<String, Object>> scenes = new ArrayList<>();

        scenes.add(scene(1, "hero_reveal", "dolly_up", scene1,
            hook.isBlank() ? "Quay lưng trên nóc nhà — thành phố neon phía sau" : hook,
            "hero_back", "wide", "center", "rooftop_neon", 1));

        scenes.add(scene(2, "dodge", "dodge_shake", scene2,
            "Né đòn slow motion — kẻ thù lao tới",
            "dodge", "medium", "left", "rooftop_neon", 1));

        scenes.add(scene(3, "combo", "pose_sequence", scene3,
            "Combo kick → elbow → slide dodge",
            "combo", "medium", "center", "rooftop_neon", 6));

        scenes.add(scene(4, "hero_finale", "hero_rim", scene4,
            "Hero shot — ánh rim neon, cận mặt",
            "hero", "closeup", "center", "rooftop_neon", 1));

        String caption = (hook.isBlank() ? "Khi võ thuật gặp neon rooftop 🥋" : hook)
            + " #vothuat #martialarts #cinematic #tiktok #fyp #action";

        return new MartialPlan(
            true,
            "Võ thuật cinematic — nhân vật từ ảnh user",
            "9:16",
            total,
            scenes,
            caption,
            List.of("vothuat", "martialarts", "cinematic", "neon", "rooftop", "action", "fyp"),
            "Martial template 4 cảnh — Java2D + FFmpeg local"
        );
    }

    private static Map<String, Object> scene(
        int index,
        String sceneId,
        String motionPreset,
        int durationSec,
        String caption,
        String characterAction,
        String shotType,
        String placement,
        String backgroundTheme,
        int frameCount
    ) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("sceneIndex", index);
        s.put("sceneId", sceneId);
        s.put("motionPreset", motionPreset);
        s.put("durationSec", durationSec);
        s.put("dialogue", caption);
        s.put("narration", caption);
        s.put("visualPrompt", caption);
        s.put("characterAction", characterAction);
        s.put("shotType", shotType);
        s.put("characterPlacement", placement);
        s.put("backgroundTheme", backgroundTheme);
        s.put("frameCount", frameCount);
        return s;
    }

    private static String extractHook(String script) {
        if (script == null || script.isBlank()) return "";
        String line = script.lines()
            .map(String::trim)
            .filter(l -> !l.isBlank())
            .findFirst()
            .orElse("")
            .replaceAll("(?i)^(kịch bản|script|video)\\s*[:：]\\s*", "");
        if (line.length() > 120) {
            line = line.substring(0, 117) + "...";
        }
        return line;
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    public static boolean isMartialScene(Map<String, Object> scene) {
        if (scene == null) return false;
        String id = String.valueOf(scene.get("sceneId")).toLowerCase(Locale.ROOT);
        if (!id.isBlank() && !"null".equals(id)) return true;
        String preset = String.valueOf(scene.get("motionPreset")).toLowerCase(Locale.ROOT);
        return preset.contains("dolly") || preset.contains("dodge") || preset.contains("hero")
            || preset.contains("pose_sequence");
    }
}
