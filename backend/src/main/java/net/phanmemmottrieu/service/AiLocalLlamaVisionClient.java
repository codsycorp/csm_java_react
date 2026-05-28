package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class AiLocalLlamaVisionClient {

    private static final Logger log = LoggerFactory.getLogger(AiLocalLlamaVisionClient.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final WebClient.Builder webClientBuilder;

    @Value("${ai.orchestration.multimodal.vision.endpoint:}")
    private String visionEndpoint;

    @Value("${ai.orchestration.multimodal.vision.model-name:smolvlm}")
    private String visionModelName;

    @Value("${ai.orchestration.multimodal.vision.timeout-ms:12000}")
    private long visionTimeoutMs;

    public AiLocalLlamaVisionClient(WebClient.Builder webClientBuilder) {
        this.webClientBuilder = webClientBuilder;
    }

    public boolean isConfigured() {
        return !String.valueOf(visionEndpoint == null ? "" : visionEndpoint).isBlank();
    }

    public String describeImage(String prompt, String imageBase64, String mimeType) {
        if (!isConfigured() || imageBase64 == null || imageBase64.isBlank()) {
            return "";
        }
        try {
            String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();
            if (safePrompt.isBlank()) {
                safePrompt = "Describe this image for software implementation.";
            }
            String safeMime = String.valueOf(mimeType == null ? "" : mimeType).trim();
            if (safeMime.isBlank()) {
                safeMime = "image/jpeg";
            }

            Map<String, Object> textPart = new LinkedHashMap<>();
            textPart.put("type", "text");
            textPart.put("text", safePrompt);

            Map<String, Object> imageUrl = new LinkedHashMap<>();
            imageUrl.put("url", "data:" + safeMime + ";base64," + imageBase64.trim());

            Map<String, Object> imagePart = new LinkedHashMap<>();
            imagePart.put("type", "image_url");
            imagePart.put("image_url", imageUrl);

            List<Map<String, Object>> content = new ArrayList<>();
            content.add(textPart);
            content.add(imagePart);

            Map<String, Object> message = new LinkedHashMap<>();
            message.put("role", "user");
            message.put("content", content);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", String.valueOf(visionModelName == null ? "smolvlm" : visionModelName).trim());
            payload.put("temperature", 0.1);
            payload.put("max_tokens", 512);
            payload.put("messages", List.of(message));

            String chatUrl = resolveChatCompletionsUrl(visionEndpoint);
            WebClient client = webClientBuilder.build();
            String raw = client.post()
                .uri(chatUrl)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(java.time.Duration.ofMillis(Math.max(500L, visionTimeoutMs)))
                .block();
            return parseVisionResponse(raw);
        } catch (Exception ex) {
            log.debug("Local llama vision failed: {}", ex.getMessage());
            return "";
        }
    }

    private String resolveChatCompletionsUrl(String endpoint) {
        String base = String.valueOf(endpoint == null ? "" : endpoint).trim();
        if (base.isBlank()) {
            return "";
        }
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String lower = base.toLowerCase(Locale.ROOT);
        if (lower.endsWith("/v1/chat/completions")) {
            return base;
        }
        if (lower.endsWith("/v1")) {
            return base + "/chat/completions";
        }
        return base + "/v1/chat/completions";
    }

    private String parseVisionResponse(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(raw);
            JsonNode choices = node.path("choices");
            if (choices.isArray() && !choices.isEmpty()) {
                JsonNode message = choices.get(0).path("message");
                JsonNode content = message.path("content");
                if (content.isArray()) {
                    StringBuilder sb = new StringBuilder();
                    for (JsonNode part : content) {
                        if ("text".equals(part.path("type").asText(""))) {
                            String text = part.path("text").asText("").trim();
                            if (!text.isBlank()) {
                                if (sb.length() > 0) {
                                    sb.append('\n');
                                }
                                sb.append(text);
                            }
                        }
                    }
                    return sb.toString().trim();
                }
                String text = content.asText("").trim();
                if (!text.isBlank()) {
                    return text;
                }
            }
            for (String key : new String[]{"description", "text", "content", "response"}) {
                String value = node.path(key).asText("").trim();
                if (!value.isBlank()) {
                    return value;
                }
            }
        } catch (Exception ignored) {
            return compactWhitespace(raw);
        }
        return compactWhitespace(raw);
    }

    private String compactWhitespace(String text) {
        return String.valueOf(text == null ? "" : text)
            .replace("\r", " ")
            .replace("\n", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }
}
