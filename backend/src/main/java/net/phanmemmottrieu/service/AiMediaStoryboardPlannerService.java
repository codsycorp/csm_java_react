package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiMediaStoryboardPlannerService {

    private static final Logger log = LoggerFactory.getLogger(AiMediaStoryboardPlannerService.class);
    private static final Pattern JSON_BLOCK = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Value("${ai.media.storyboard.enabled:true}")
    private boolean enabled;

    @Value("${ai.media.storyboard.max-scenes:5}")
    private int maxScenes;

    @Value("${ai.media.storyboard.default-scene-sec:5}")
    private int defaultSceneSec;

    public record StoryboardPlan(
        boolean success,
        String title,
        String aspectRatio,
        int totalDurationSec,
        List<Map<String, Object>> scenes,
        String source,
        String message
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("success", success);
            out.put("title", title);
            out.put("aspectRatio", aspectRatio);
            out.put("totalDurationSec", totalDurationSec);
            out.put("scenes", scenes);
            out.put("source", source);
            if (message != null) out.put("message", message);
            return out;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public StoryboardPlan plan(String script, String characterHint, int targetDurationSec) {
        return plan(script, characterHint, targetDurationSec, null);
    }

    public StoryboardPlan plan(String script, String characterHint, int targetDurationSec, Map<String, Object> characterProfile) {
        if (!enabled) {
            return fail("Storyboard planner tắt (ai.media.storyboard.enabled=false)");
        }
        String text = String.valueOf(script == null ? "" : script).trim();
        if (text.isBlank()) {
            return fail("Thiếu kịch bản (message)");
        }
        int duration = Math.max(9, Math.min(60, targetDurationSec > 0 ? targetDurationSec : 15));

        if (llamaCppNativeService != null && llamaCppNativeService.isAvailable()) {
            try {
                StoryboardPlan llm = planWithLlm(text, characterHint, duration, characterProfile);
                if (llm != null && llm.success()) {
                    return llm;
                }
            } catch (Exception ex) {
                log.warn("Storyboard LLM failed, fallback heuristic: {}", ex.getMessage());
            }
        }
        return planHeuristic(text, duration, characterProfile);
    }

    private StoryboardPlan planWithLlm(String script, String characterHint, int targetDurationSec, Map<String, Object> characterProfile) throws Exception {
        String profileBlock = formatCharacterProfile(characterProfile);
        String prompt = """
            Bạn là director video marketing BĐS. Nhân vật trong ảnh user sẽ LÀM CHÍNH nhân vật diễn xuyên suốt video theo kịch bản.
            Từ KỊCH BẢN sau, trả về ĐÚNG 1 JSON (không markdown thừa):
            {
              "title": "...",
              "aspectRatio": "9:16",
              "totalDurationSec": %d,
              "scenes": [
                {
                  "id": "s1",
                  "durationSec": 5,
                  "dialogue": "câu thoại nhân vật nói trong cảnh này (KHÁC nhau mỗi cảnh)",
                  "narration": "cùng dialogue hoặc tóm tắt",
                  "visualPrompt": "bối cảnh BĐS cụ thể",
                  "characterAction": "speak_to_camera|gesture_present|walk_in|showcase_property",
                  "shotType": "closeup|medium|wide",
                  "characterPlacement": "left-third|right-third|center",
                  "backgroundTheme": "luxury|urban|nature|office|warm"
                }
              ]
            }
            Quy tắc:
            - 3-%d cảnh; tổng durationSec các cảnh = %d giây
            - Mỗi cảnh dialogue RIÊNG, bám kịch bản, tiếng Việt tự nhiên
            - characterAction mô tả nhân vật ĐANG LÀM GÌ (nói, giới thiệu, chỉ tay, bước vào khung)
            - visualPrompt mô tả cảnh quay BĐS, không lặp y hệt giữa các cảnh
            %s
            Gợi ý nhân vật: %s
            KỊCH BẢN:
            %s
            """.formatted(
            targetDurationSec,
            maxScenes,
            targetDurationSec,
            profileBlock,
            String.valueOf(characterHint == null ? "" : characterHint).trim(),
            script.length() > 3500 ? script.substring(0, 3500) : script);

        String raw = llamaCppNativeService.generateContentFast(prompt, 900);
        JsonNode root = parseJsonFromLlm(raw);
        if (root == null || !root.isObject()) {
            return null;
        }
        return normalizePlan(root, "llm", targetDurationSec);
    }

    private StoryboardPlan planHeuristic(String script, int targetDurationSec, Map<String, Object> characterProfile) {
        List<String> chunks = splitScriptChunks(script);
        int sceneCount = Math.max(3, Math.min(maxScenes, Math.max(chunks.size(), 3)));
        String[] themes = {"luxury", "urban", "nature", "office", "warm"};
        String[] placements = {"left-third", "right-third", "center"};
        String[] actions = {"speak_to_camera", "gesture_present", "walk_in", "showcase_property", "speak_to_camera"};
        String[] shots = {"medium", "closeup", "wide", "medium", "closeup"};

        List<Map<String, Object>> scenes = new ArrayList<>();
        for (int i = 0; i < sceneCount; i++) {
            String dialogue = buildSceneDialogue(chunks, i, sceneCount, script);
            Map<String, Object> scene = new LinkedHashMap<>();
            scene.put("id", "s" + (i + 1));
            scene.put("durationSec", defaultSceneSec);
            scene.put("dialogue", dialogue);
            scene.put("narration", dialogue);
            scene.put("visualPrompt", inferVisualPrompt(dialogue, i));
            scene.put("characterAction", actions[i % actions.length]);
            scene.put("shotType", shots[i % shots.length]);
            scene.put("characterPlacement", placements[i % placements.length]);
            scene.put("backgroundTheme", themes[i % themes.length]);
            scenes.add(scene);
        }
        balanceSceneDurations(scenes, targetDurationSec);

        String title = narrationHeadline(chunks.isEmpty() ? script : chunks.get(0));
        return new StoryboardPlan(true, title, "9:16", targetDurationSec, scenes, "heuristic",
            "Storyboard heuristic — nhân vật: " + formatCharacterProfile(characterProfile));
    }

    private StoryboardPlan normalizePlan(JsonNode root, String source, int targetDurationSec) {
        String title = text(root.get("title"), "Video marketing");
        String aspect = text(root.get("aspectRatio"), "9:16");
        JsonNode scenesNode = root.get("scenes");
        List<Map<String, Object>> scenes = new ArrayList<>();
        if (scenesNode != null && scenesNode.isArray()) {
            int idx = 0;
            for (JsonNode n : scenesNode) {
                if (idx >= maxScenes) break;
                if (n == null || !n.isObject()) continue;
                String dialogue = trim(text(n.get("dialogue"), text(n.get("narration"), "")), 280);
                if (dialogue.isBlank()) continue;
                Map<String, Object> scene = new LinkedHashMap<>();
                scene.put("id", text(n.get("id"), "s" + (idx + 1)));
                scene.put("durationSec", Math.max(3, Math.min(12, n.path("durationSec").asInt(defaultSceneSec))));
                scene.put("dialogue", dialogue);
                scene.put("narration", dialogue);
                scene.put("visualPrompt", trim(text(n.get("visualPrompt"), inferVisualPrompt(dialogue, idx)), 200));
                scene.put("characterAction", normalizeAction(text(n.get("characterAction"), "speak_to_camera")));
                scene.put("shotType", normalizeShot(text(n.get("shotType"), "medium")));
                scene.put("characterPlacement", normalizePlacement(text(n.get("characterPlacement"), "left-third")));
                scene.put("backgroundTheme", normalizeTheme(text(n.get("backgroundTheme"), "luxury")));
                scenes.add(scene);
                idx++;
            }
        }
        if (scenes.isEmpty()) {
            return null;
        }
        balanceSceneDurations(scenes, targetDurationSec);
        int total = targetDurationSec > 0 ? targetDurationSec
            : scenes.stream().mapToInt(s -> (int) s.getOrDefault("durationSec", defaultSceneSec)).sum();
        return new StoryboardPlan(true, title, aspect, total, scenes, source, "OK");
    }

    private void balanceSceneDurations(List<Map<String, Object>> scenes, int targetTotal) {
        if (scenes == null || scenes.isEmpty()) return;
        int total = Math.max(9, Math.min(60, targetTotal));
        int n = scenes.size();
        int base = total / n;
        int rem = total % n;
        for (int i = 0; i < n; i++) {
            scenes.get(i).put("durationSec", Math.max(3, base + (i < rem ? 1 : 0)));
        }
    }

    private String buildSceneDialogue(List<String> chunks, int index, int sceneCount, String script) {
        if (!chunks.isEmpty()) {
            if (chunks.size() >= sceneCount) {
                return chunks.get(Math.min(index, chunks.size() - 1));
            }
            return chunks.get(index % chunks.size());
        }
        String[] parts = script.split("(?<=[.!?…])\\s+");
        if (parts.length >= sceneCount) {
            return parts[Math.min(index, parts.length - 1)].trim();
        }
        return index == 0 ? script.trim() : "Tiếp theo — " + script.trim();
    }

    private String formatCharacterProfile(Map<String, Object> characterProfile) {
        if (characterProfile == null || characterProfile.isEmpty()) {
            return "";
        }
        return "\nNHÂN VẬT (từ ảnh user — phải là presenter chính):\n"
            + "- role: " + characterProfile.getOrDefault("role", "presenter") + "\n"
            + "- gender: " + characterProfile.getOrDefault("gender", "unknown") + "\n"
            + "- attire: " + characterProfile.getOrDefault("attire", "professional") + "\n"
            + "- style: " + characterProfile.getOrDefault("presenterStyle", "") + "\n"
            + "- mô tả: " + characterProfile.getOrDefault("description", "") + "\n";
    }

    private String normalizeAction(String raw) {
        String v = raw.toLowerCase(Locale.ROOT);
        if (v.contains("walk")) return "walk_in";
        if (v.contains("gesture") || v.contains("present") || v.contains("chỉ")) return "gesture_present";
        if (v.contains("showcase") || v.contains("property") || v.contains("căn hộ")) return "showcase_property";
        return "speak_to_camera";
    }

    private String normalizeShot(String raw) {
        String v = raw.toLowerCase(Locale.ROOT);
        if (v.contains("close")) return "closeup";
        if (v.contains("wide")) return "wide";
        return "medium";
    }

    private JsonNode parseJsonFromLlm(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String candidate = raw.trim();
        Matcher m = JSON_BLOCK.matcher(candidate);
        if (m.find()) {
            candidate = m.group(1).trim();
        }
        int start = candidate.indexOf('{');
        int end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
            candidate = candidate.substring(start, end + 1);
        }
        try {
            return objectMapper.readTree(candidate);
        } catch (Exception ex) {
            log.debug("Cannot parse storyboard JSON: {}", ex.getMessage());
            return null;
        }
    }

    private List<String> splitScriptChunks(String script) {
        List<String> out = new ArrayList<>();
        for (String line : script.split("\\r?\\n")) {
            String t = line.trim();
            if (!t.isBlank()) out.add(t);
        }
        if (out.size() >= 2) {
            return out;
        }
        String[] sentences = script.split("(?<=[.!?…])\\s+");
        for (String s : sentences) {
            String t = s.trim();
            if (t.length() >= 8) out.add(t);
        }
        if (out.isEmpty()) {
            out.add(script.trim());
        }
        return out;
    }

    private String inferVisualPrompt(String narration, int sceneIndex) {
        String lower = narration.toLowerCase(Locale.ROOT);
        if (lower.contains("căn hộ") || lower.contains("chung cư") || lower.contains("vinhomes")) {
            return sceneIndex % 2 == 0
                ? "Luxury apartment living room, floor-to-ceiling windows, city view"
                : "Modern high-rise exterior, Vinhomes style, golden hour";
        }
        if (lower.contains("biệt thự") || lower.contains("villa")) {
            return "Premium villa garden, pool area, soft daylight";
        }
        if (lower.contains("văn phòng") || lower.contains("office")) {
            return "Corporate lobby, glass facade, professional atmosphere";
        }
        if (lower.contains("cho thuê") || lower.contains("thuê")) {
            return "Urban residential street, welcoming home entrance";
        }
        return sceneIndex % 2 == 0
            ? "Elegant property showroom, modern interior"
            : "Aerial city skyline, premium real estate district";
    }

    private String inferVisualPrompt(String narration) {
        return inferVisualPrompt(narration, 0);
    }

    private String normalizePlacement(String raw) {
        String v = raw.toLowerCase(Locale.ROOT);
        if (v.contains("right")) return "right-third";
        if (v.contains("center")) return "center";
        return "left-third";
    }

    private String normalizeTheme(String raw) {
        String v = raw.toLowerCase(Locale.ROOT);
        if (v.contains("urban")) return "urban";
        if (v.contains("nature") || v.contains("green")) return "nature";
        if (v.contains("office")) return "office";
        if (v.contains("warm")) return "warm";
        return "luxury";
    }

    private String narrationHeadline(String s) {
        if (s == null || s.isBlank()) return "Video marketing";
        return s.length() > 64 ? s.substring(0, 61) + "..." : s;
    }

    private String text(JsonNode node, String fallback) {
        if (node == null || node.isNull()) return fallback;
        return String.valueOf(node.asText("")).trim();
    }

    private String trim(String s, int max) {
        if (s == null) return "";
        if (s.length() <= max) return s;
        return s.substring(0, max - 3) + "...";
    }

    private StoryboardPlan fail(String message) {
        return new StoryboardPlan(false, "", "9:16", 0, List.of(), "none", message);
    }
}
