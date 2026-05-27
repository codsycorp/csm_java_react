package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * LMKT SEO content lane — isolated from ai-code-stream / menu JSON.
 * One-shot pipeline: creative params (internal) → full SEO article JSON (single HTTP response).
 */
@Service
public class AiSeoContentPipelineService {

    private static final Logger log = LoggerFactory.getLogger(AiSeoContentPipelineService.class);

    private static final List<String> DEFAULT_ANTI_AI_PERSONAS = List.of(
        "investor", "family", "local_resident", "business_owner", "storyteller");
    private static final List<String> DEFAULT_ANTI_AI_PATTERNS = List.of(
        "investment_analysis", "family_story", "step_by_step_guide", "quick_tips", "landing_page");
    private static final List<String> DEFAULT_ANTI_AI_SELLING = List.of(
        "title_explicit", "content_subtle", "content_implicit");

    @Autowired
    private AiAssistantGatewayService aiAssistantGatewayService;

    @Value("${ai.seo.pipeline.enabled:true}")
    private boolean seoPipelineEnabled;

    @Value("${ai.seo.article.target-words-vi:900-1200}")
    private String seoArticleTargetWordsVi;

    private static final List<String> SEO_REQUIRED_FIELDS = List.of(
        "title", "content", "content_en", "content_zh",
        "attributes_title", "attributes_title_en", "attributes_title_zh",
        "attributes_description", "attributes_description_en", "attributes_description_zh",
        "attributes_keywords", "attributes_keywords_en", "attributes_keywords_zh");

    @Value("${ai.seo.pipeline.article-retry.enabled:true}")
    private boolean articleRetryEnabled;

    public boolean isEnabled() {
        return seoPipelineEnabled && aiAssistantGatewayService != null;
    }

    public boolean isOneShotPipelineRequest(Map<String, Object> params) {
        if (params == null || !seoPipelineEnabled) {
            return false;
        }
        String pipeline = String.valueOf(params.getOrDefault("seoPipeline", "")).trim().toLowerCase(Locale.ROOT);
        return "anti_ai_one_shot".equals(pipeline) || "seo_article_one_shot".equals(pipeline);
    }

    /**
     * Runs creative-params + full article in one backend call. Caller waits once (sync or async job).
     */
    public String runAntiAiOneShot(
            Map<String, Object> seoContext,
            AiAssistantGatewayService.ProgressListener progressListener) {
        if (!isEnabled()) {
            return aiAssistantGatewayService.createErrorJson(
                "SEO pipeline chưa bật hoặc AI gateway không khả dụng", "SEO_PIPELINE_DISABLED");
        }
        Map<String, Object> ctx = seoContext == null ? Map.of() : seoContext;
        String industry = str(ctx.get("industry"), "bat-dong-san");
        String topic = str(ctx.get("topic"), "");
        if (topic.isBlank()) {
            topic = str(ctx.get("content"), "");
        }
        if (topic.isBlank()) {
            return aiAssistantGatewayService.createErrorJson(
                "Thiếu topic/content trong seoContext", "SEO_PIPELINE_MISSING_TOPIC");
        }
        String domainKey = str(ctx.get("domainKey"), "lmkt");
        String seed = str(ctx.get("seed"), System.currentTimeMillis() + "_" + Math.abs(topic.hashCode()));

        log.info("SEO_PIPELINE anti_ai_one_shot start industry={} domain={} topicChars={}",
            industry, domainKey, topic.length());

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_pipeline_creative",
                "message", "Bước 1/2: Chọn thông số sáng tạo (creative params)...",
                "percent", 10));
        }

        String creativePrompt = buildAntiAiCreativeParamsPrompt(industry, topic, domainKey, seed);
        String creativeRaw = aiAssistantGatewayService.generateSeoContent(creativePrompt, progressListener);
        Map<String, Object> creative = aiAssistantGatewayService.extractCreativeParamsFromProviderRaw(creativeRaw, "anti_ai");

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_pipeline_article",
                "message", "Bước 2/2: Viết bài SEO chuẩn Google (Local AI)...",
                "percent", 45));
        }

        String articlePrompt = buildCompactAntiAiArticlePrompt(industry, topic, domainKey, creative, ctx);
        String articleRaw = aiAssistantGatewayService.generateSeoContent(articlePrompt, progressListener);
        String normalized = finalizeSeoArticle(articleRaw, industry, topic, domainKey, creative, ctx, progressListener);

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_pipeline_complete",
                "message", "Hoàn tất pipeline SEO one-shot",
                "percent", 100));
        }

        log.info("SEO_PIPELINE anti_ai_one_shot done creativeKeys={} articleRawChars={} missingAfter={}",
            creative.keySet(),
            normalized == null ? 0 : normalized.length(),
            countMissingRequiredFields(parseSeoArticleMap(normalized)));
        return normalized;
    }

    private String finalizeSeoArticle(
            String articleRaw,
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx,
            AiAssistantGatewayService.ProgressListener progressListener) {
        Map<String, Object> merged = parseSeoArticleMap(articleRaw);
        int missing = countMissingRequiredFields(merged);
        boolean errorJson = isProviderErrorJson(articleRaw);

        if (articleRetryEnabled && (errorJson || missing > 0 || merged.isEmpty())) {
            log.info("SEO_PIPELINE article retry once (errorJson={} missingFields={})", errorJson, missing);
            if (progressListener != null) {
                progressListener.onProgress(Map.of(
                    "stage", "seo_pipeline_article_retry",
                    "message", "Model thiếu field — retry 1 lần trong cùng HTTP...",
                    "percent", 70));
            }
            String retryPrompt = buildSeoArticleRetryPrompt(industry, topic, domainKey, creative, ctx, merged);
            String retryRaw = aiAssistantGatewayService.generateSeoContent(retryPrompt, progressListener);
            mergeSeoArticleMaps(merged, parseSeoArticleMap(retryRaw));
            fillMissingSeoMetaFields(merged);
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(merged);
            } catch (Exception ex) {
                log.warn("SEO retry serialize failed: {}", ex.getMessage());
            }
        }

        return normalizeSeoArticleJson(articleRaw);
    }

    private String buildSeoArticleRetryPrompt(
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx,
            Map<String, Object> partial) {
        String base = buildCompactAntiAiArticlePrompt(industry, topic, domainKey, creative, ctx);
        StringBuilder missing = new StringBuilder();
        for (String field : SEO_REQUIRED_FIELDS) {
            if (isBlank(partial.get(field))) {
                if (missing.length() > 0) missing.append(", ");
                missing.append(field);
            }
        }
        return base + "\n\n[RETRY] Lần trước thiếu field: " + missing
            + ". BẮT BUỘC trả JSON đủ 12 field. Giữ topic/industry. Chỉ JSON, không markdown.";
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseSeoArticleMap(String articleRaw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (articleRaw == null || articleRaw.isBlank()) {
            return out;
        }
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String text = aiAssistantGatewayService.extractProviderText(articleRaw);
            if (text == null || text.isBlank()) {
                text = articleRaw.trim();
            }
            text = stripMarkdownJsonFence(text);
            Map<String, Object> parsed = mapper.readValue(text, Map.class);
            if (parsed.containsKey("title") || parsed.containsKey("content")) {
                out.putAll(parsed);
            } else if (parsed.get("data") instanceof Map<?, ?> dataMap) {
                for (Map.Entry<?, ?> e : dataMap.entrySet()) {
                    if (e.getKey() != null) out.put(String.valueOf(e.getKey()), e.getValue());
                }
            } else {
                out.putAll(parsed);
            }
            fillMissingSeoMetaFields(out);
        } catch (Exception ex) {
            log.warn("SEO parseSeoArticleMap failed: {}", ex.getMessage());
        }
        return out;
    }

    private static void mergeSeoArticleMaps(Map<String, Object> target, Map<String, Object> patch) {
        if (patch == null || patch.isEmpty()) return;
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            if (entry.getKey() == null || isBlank(entry.getValue())) continue;
            target.put(entry.getKey(), String.valueOf(entry.getValue()).trim());
        }
    }

    private static int countMissingRequiredFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return SEO_REQUIRED_FIELDS.size();
        }
        int missing = 0;
        for (String field : SEO_REQUIRED_FIELDS) {
            if (isBlank(payload.get(field))) missing++;
        }
        return missing;
    }

    private static boolean isProviderErrorJson(String raw) {
        if (raw == null || raw.isBlank()) return true;
        String lower = raw.toLowerCase(Locale.ROOT);
        return lower.contains("\"success\":false") || lower.contains("\"error\":true")
            || lower.contains("local_provider_unavailable") || lower.contains("local_inference_failed");
    }

    private static String stripMarkdownJsonFence(String text) {
        String t = text == null ? "" : text.trim();
        if (t.startsWith("```")) {
            int start = t.indexOf('{');
            int end = t.lastIndexOf('}');
            if (start >= 0 && end > start) {
                return t.substring(start, end + 1);
            }
        }
        return t;
    }

    /**
     * Model local 1.5B đôi khi thiếu meta EN/ZH — bổ sung fallback để đủ 12 field LMKT.
     */
    public String normalizeSeoArticleJson(String articleRaw) {
        Map<String, Object> map = parseSeoArticleMap(articleRaw);
        if (map.isEmpty()) {
            return articleRaw;
        }
        fillMissingSeoMetaFields(map);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(map);
        } catch (Exception ex) {
            log.warn("SEO normalize serialize failed: {}", ex.getMessage());
            return articleRaw;
        }
    }

    public void fillMissingSeoMetaFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        fillIfBlank(payload, "attributes_description_zh",
            payload.get("attributes_description_en"),
            plainTextExcerpt(payload.get("content_zh"), 160),
            payload.get("attributes_description"));

        fillIfBlank(payload, "attributes_keywords_en",
            payload.get("attributes_keywords"),
            keywordsFromTitle(payload.get("attributes_title_en"), payload.get("attributes_keywords")));

        fillIfBlank(payload, "attributes_keywords_zh",
            payload.get("attributes_keywords"),
            keywordsFromTitle(payload.get("attributes_title_zh"), payload.get("attributes_keywords")));
    }

    private static void fillIfBlank(Map<String, Object> payload, String key, Object... candidates) {
        if (!isBlank(payload.get(key))) {
            return;
        }
        for (Object candidate : candidates) {
            if (!isBlank(candidate)) {
                payload.put(key, String.valueOf(candidate).trim());
                return;
            }
        }
    }

    private static boolean isBlank(Object value) {
        return value == null || String.valueOf(value).trim().isEmpty();
    }

    private static String plainTextExcerpt(Object htmlOrText, int maxLen) {
        if (htmlOrText == null) {
            return "";
        }
        String plain = String.valueOf(htmlOrText)
            .replaceAll("<[^>]+>", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (plain.isEmpty()) {
            return "";
        }
        if (plain.length() <= maxLen) {
            return plain;
        }
        return plain.substring(0, Math.max(0, maxLen - 3)).trim() + "...";
    }

    private static String keywordsFromTitle(Object titleObj, Object keywordsFallback) {
        String title = String.valueOf(titleObj == null ? "" : titleObj).trim();
        String fallback = String.valueOf(keywordsFallback == null ? "" : keywordsFallback).trim();
        if (!title.isEmpty()) {
            String base = title.length() > 72 ? title.substring(0, 72).trim() : title;
            if (!fallback.isEmpty()) {
                return base + ", " + fallback;
            }
            return base;
        }
        return fallback;
    }

    public Map<String, Object> extractSeoContext(Map<String, Object> params) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (params == null) {
            return out;
        }
        Object nested = params.get("seoContext");
        if (nested instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() != null) {
                    out.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
        }
        for (String key : List.of("industry", "topic", "content", "domainKey", "property", "location", "business", "seed")) {
            if (params.containsKey(key) && params.get(key) != null) {
                out.put(key, params.get(key));
            }
        }
        return out;
    }

    private String buildAntiAiCreativeParamsPrompt(String industry, String topic, String domainKey, String seed) {
        return ("""
            [CREATIVE_PARAMS_REQUEST]
            SEED: %s
            KIND: anti_ai
            INDUSTRY: %s
            TOPIC: %s
            DOMAIN: %s

            Chọn thông số sáng tạo để tạo nội dung khác biệt, KHÔNG viết content.
            Chỉ trả về JSON hợp lệ, 1 dòng, không markdown.

            Allowed personaKey: %s
            Allowed contentPattern: %s
            Allowed sellingIntent: %s

            Output JSON:
            {
              "personaKey": "<one of personaKey>",
              "contentPattern": "<one of contentPattern>",
              "sellingIntent": "<one of sellingIntent>",
              "hook": "Short opening hook (3-8 words)",
              "angle": "Short creative angle",
              "tone": "Short tone description"
            }
            """).formatted(
            seed,
            industry,
            topic,
            domainKey,
            String.join(", ", DEFAULT_ANTI_AI_PERSONAS),
            String.join(", ", DEFAULT_ANTI_AI_PATTERNS),
            String.join(", ", DEFAULT_ANTI_AI_SELLING)).trim();
    }

    private String buildCompactAntiAiArticlePrompt(
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx) {
        String personaKey = str(creative.get("personaKey"), "investor");
        String contentPattern = str(creative.get("contentPattern"), "landing_page");
        String sellingIntent = str(creative.get("sellingIntent"), "content_subtle");
        String hook = str(creative.get("hook"), "");
        String angle = str(creative.get("angle"), "");
        String tone = str(creative.get("tone"), "");
        String property = str(ctx.get("property"), "");
        String location = str(ctx.get("location"), "");
        String uniqueSeed = "[UNIQUE_" + System.currentTimeMillis() + "]";

        return ("""
            Viết bài SEO chuẩn Google TOP 1 (E-E-A-T, heading H2/H3, internal link gợi ý, meta rõ ràng).
            Domain: %s | Industry: %s | Topic: %s
            Persona: %s | Pattern: %s | Selling: %s
            Hook: %s | Angle: %s | Tone: %s
            Property: %s | Location: %s
            %s

            Yêu cầu output: CHỈ một JSON object hợp lệ (không markdown), gồm đủ 12 fields:
            title, content, content_en, content_zh,
            attributes_title, attributes_title_en, attributes_title_zh,
            attributes_description, attributes_description_en, attributes_description_zh,
            attributes_keywords, attributes_keywords_en, attributes_keywords_zh

            - content/content_en/content_zh: HTML, %s từ (VI), EN/ZH ngắn gọn hơn 30-40%%
            - attributes_title*: 60-80 ký tự SEO
            - attributes_description*: 150-160 ký tự
            - attributes_keywords*: 5-8 từ khóa, phẩy ngăn cách
            - Model local 1.5B: JSON hợp lệ đủ 12 field quan trọng hơn độ dài; content VI ~500-900 từ
            - Tránh văn phong AI; viết như chuyên gia thực tế
            - Kết thúc JSON ngay sau field cuối — không thêm text ngoài JSON
            """).formatted(
            domainKey,
            industry,
            topic,
            personaKey,
            contentPattern,
            sellingIntent,
            hook,
            angle,
            tone,
            property,
            location,
            uniqueSeed,
            seoArticleTargetWordsVi).trim();
    }

    private static String str(Object value, String defaultValue) {
        String s = String.valueOf(value == null ? "" : value).trim();
        return s.isBlank() ? defaultValue : s;
    }
}
