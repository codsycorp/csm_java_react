package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Vision + LLM — nhận diện nhân vật từ ảnh user để director video bám đúng kịch bản.
 */
@Service
public class AiCharacterProfileService {

    private static final Logger log = LoggerFactory.getLogger(AiCharacterProfileService.class);
    private static final Pattern JSON_BLOCK = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiLocalLlamaVisionClient aiLocalLlamaVisionClient;

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Value("${ai.orchestration.multimodal.vision.enabled:false}")
    private boolean visionEnabled;

    public AiCharacterProfileService(AiLocalLlamaVisionClient aiLocalLlamaVisionClient) {
        this.aiLocalLlamaVisionClient = aiLocalLlamaVisionClient;
    }

    public Map<String, Object> analyze(byte[] imageBytes, String mimeType, String scriptHint) {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("source", "heuristic");
        profile.put("role", "presenter");
        profile.put("gender", "unknown");
        profile.put("attire", "professional");
        profile.put("ageRange", "adult");
        profile.put("presenterStyle", "formal real-estate agent");
        profile.put("description", "Portrait photo — professional presenter");
        profile.put("imageSize", imageDimensions(imageBytes));

        String visionText = invokeCharacterVision(imageBytes, mimeType);
        if (!visionText.isBlank()) {
            profile.put("visionSummary", visionText);
            profile.put("source", "vision");
            mergeVisionHeuristics(profile, visionText);
        }

        if (llamaCppNativeService != null && llamaCppNativeService.isAvailable()) {
            try {
                Map<String, Object> structured = structureWithLlm(profile, visionText, scriptHint);
                if (structured != null && !structured.isEmpty()) {
                    profile.putAll(structured);
                    profile.put("source", visionText.isBlank() ? "llm" : "vision+llm");
                }
            } catch (Exception ex) {
                log.warn("Character profile LLM structuring failed: {}", ex.getMessage());
            }
        }

        profile.put("directorHint",
            String.format("%s %s, %s, %s — dùng làm nhân vật chính xuyên suốt video",
                profile.get("gender"), profile.get("role"), profile.get("attire"), profile.get("presenterStyle")));
        return profile;
    }

    private String invokeCharacterVision(byte[] imageBytes, String mimeType) {
        if (!visionEnabled || !aiLocalLlamaVisionClient.isConfigured()) {
            return "";
        }
        if (imageBytes == null || imageBytes.length == 0) {
            return "";
        }
        try {
            String prompt = """
                Phân tích ẢNH NHÂN VẬT cho video marketing BĐS. Trả lời ngắn gọn tiếng Việt:
                - Giới tính / độ tuổi ước lượng
                - Trang phục (formal/casual)
                - Vai trò presenter phù hợp (môi giới, chủ đầu tư, tư vấn)
                - Tư thế / biểu cảm
                - Gợi ý cách đặt nhân vật trong video (closeup, medium shot)
                """;
            String description = aiLocalLlamaVisionClient.describeImage(
                prompt,
                Base64.getEncoder().encodeToString(imageBytes),
                mimeType == null ? "image/jpeg" : mimeType
            );
            if (description.isBlank()) {
                return "";
            }
            return description.length() > 1200 ? description.substring(0, 1197) + "..." : description;
        } catch (Exception ex) {
            log.debug("Character vision failed: {}", ex.getMessage());
        }
        return "";
    }

    private Map<String, Object> structureWithLlm(Map<String, Object> seed, String visionText, String scriptHint) throws Exception {
        String prompt = """
            Từ mô tả nhân vật và kịch bản, trả về ĐÚNG 1 JSON (không markdown):
            {"role":"...","gender":"male|female|unknown","attire":"...","ageRange":"...","presenterStyle":"...","description":"..."}
            MÔ TẢ VISION: %s
            GỢI Ý KỊCH BẢN: %s
            """.formatted(
            visionText.isBlank() ? seed.get("description") : visionText,
            String.valueOf(scriptHint == null ? "" : scriptHint).trim()
        );
        String raw = llamaCppNativeService.generateContentFast(prompt, 256);
        JsonNode node = parseJson(raw);
        if (node == null || !node.isObject()) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        putIfPresent(out, "role", node.path("role").asText(""));
        putIfPresent(out, "gender", node.path("gender").asText(""));
        putIfPresent(out, "attire", node.path("attire").asText(""));
        putIfPresent(out, "ageRange", node.path("ageRange").asText(""));
        putIfPresent(out, "presenterStyle", node.path("presenterStyle").asText(""));
        putIfPresent(out, "description", node.path("description").asText(""));
        return out;
    }

    private void mergeVisionHeuristics(Map<String, Object> profile, String visionText) {
        String lower = visionText.toLowerCase(Locale.ROOT);
        if (lower.contains("nam") || lower.contains("male") || lower.contains("anh ") || lower.contains("ông")) {
            profile.put("gender", "male");
        } else if (lower.contains("nữ") || lower.contains("female") || lower.contains("chị ") || lower.contains("cô")) {
            profile.put("gender", "female");
        }
        if (lower.contains("vest") || lower.contains("suit") || lower.contains("cà vạt") || lower.contains("formal")) {
            profile.put("attire", "formal suit");
        }
        if (lower.contains("môi giới") || lower.contains("agent")) {
            profile.put("role", "real-estate agent");
        }
        profile.put("description", visionText.length() > 400 ? visionText.substring(0, 397) + "..." : visionText);
    }

    private String imageDimensions(byte[] imageBytes) {
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(imageBytes));
            if (img == null) return "unknown";
            return img.getWidth() + "x" + img.getHeight();
        } catch (Exception ex) {
            return "unknown";
        }
    }

    private JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String candidate = raw.trim();
        Matcher m = JSON_BLOCK.matcher(candidate);
        if (m.find()) candidate = m.group(1).trim();
        int start = candidate.indexOf('{');
        int end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) candidate = candidate.substring(start, end + 1);
        try {
            return objectMapper.readTree(candidate);
        } catch (Exception ex) {
            return null;
        }
    }

    private void putIfPresent(Map<String, Object> out, String key, String value) {
        if (value != null && !value.isBlank()) {
            out.put(key, value.trim());
        }
    }
}
