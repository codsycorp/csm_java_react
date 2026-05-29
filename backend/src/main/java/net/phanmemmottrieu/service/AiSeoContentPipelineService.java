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
 * Single HTTP: client gửi một lần, chờ xử lý xong, nhận JSON bài viết đầy đủ.
 * Không dùng multi-step pipeline; một lần gọi Local AI (retry parse tối đa 1 lần nếu cần).
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

    private static final List<String> SEO_CORE_FIELDS = List.of("title", "content");

    /** Fields LMKT auto-lmkt.js / buildDetail() expects (same contract as getAntiAIPrompt). */
    private static final List<String> SEO_REQUIRED_FIELDS = List.of(
        "title", "title_en", "title_zh",
        "description", "description_en", "description_zh",
        "content", "content_en", "content_zh",
        "keywords", "keywords_en", "keywords_zh",
        "excerpt", "excerpt_en", "excerpt_zh");

    @Value("${ai.seo.pipeline.article-retry.enabled:true}")
    private boolean articleRetryEnabled;

    @Value("${ai.seo.locale-translate.enabled:false}")
    private boolean localeTranslateEnabled;

    /** Sau lần 1 + retry: nếu VI ok mà EN/ZH thiếu/copy → gọi dịch compact (cùng HTTP, không request mới). */
    @Value("${ai.seo.locale-translate.fallback-on-incomplete:true}")
    private boolean localeTranslateFallbackEnabled;

    private static final List<String> SEO_CORE_LOCALE_FIELDS = List.of(
        "title", "content", "title_en", "content_en", "title_zh", "content_zh");

    private static final List<String> SEO_LOCALE_FIELDS = List.of(
        "title_en", "title_zh",
        "description_en", "description_zh",
        "content_en", "content_zh",
        "keywords_en", "keywords_zh",
        "excerpt_en", "excerpt_zh");

    private static final java.util.regex.Pattern VIETNAMESE_DIACRITICS = java.util.regex.Pattern.compile(
        "[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
            + "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]");

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
     * SEO lane sync: một HTTP, một lần inference Local AI, trả JSON bài viết đầy đủ.
     * Creative params chọn heuristic từ seed (không gọi LLM riêng — khác luồng menu/code).
     */
    public String runAntiAiOneShot(
            Map<String, Object> seoContext,
            AiAssistantGatewayService.ProgressListener progressListener) {
        if (!isEnabled()) {
            return aiAssistantGatewayService.createErrorJson(
                "SEO lane chưa bật hoặc AI gateway không khả dụng", "SEO_LANE_DISABLED");
        }
        Map<String, Object> ctx = seoContext == null ? Map.of() : seoContext;
        String clientPrompt = str(ctx.get("prompt"), "");
        if (!clientPrompt.isBlank()) {
            log.info("SEO_LANE using client prompt (chars={})", clientPrompt.length());
            String articleRaw = aiAssistantGatewayService.generateSeoContent(clientPrompt, progressListener);
            return finalizeSeoArticle(articleRaw, str(ctx.get("industry"), "bat-dong-san"),
                str(ctx.get("topic"), str(ctx.get("content"), "")),
                str(ctx.get("domainKey"), "lmkt"),
                resolveHeuristicCreativeParams(str(ctx.get("seed"), "client"), ctx),
                ctx, progressListener);
        }
        String industry = str(ctx.get("industry"), "bat-dong-san");
        String topic = str(ctx.get("topic"), "");
        if (topic.isBlank()) {
            topic = str(ctx.get("content"), "");
        }
        if (topic.isBlank()) {
            return aiAssistantGatewayService.createErrorJson(
                "Thiếu topic/content trong seoContext", "SEO_LANE_MISSING_TOPIC");
        }
        String domainKey = str(ctx.get("domainKey"), "lmkt");
        String seed = str(ctx.get("seed"), System.currentTimeMillis() + "_" + Math.abs(topic.hashCode()));
        Map<String, Object> creative = resolveHeuristicCreativeParams(seed, ctx);

        log.info("SEO_LANE anti_ai_one_shot start industry={} domain={} topicChars={} persona={} pattern={}",
            industry, domainKey, topic.length(), creative.get("personaKey"), creative.get("contentPattern"));

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_generation",
                "message", "Đang viết bài SEO (Local AI)...",
                "percent", 15));
        }

        String articlePrompt = buildCompactViOnlyArticlePrompt(industry, topic, domainKey, creative, ctx);
        String articleRaw = aiAssistantGatewayService.generateSeoContent(articlePrompt, progressListener);
        String normalized = finalizeViFirstSeoArticle(articleRaw, industry, topic, domainKey, creative, ctx, progressListener);

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_complete",
                "message", "Hoàn tất tạo bài SEO",
                "percent", 100));
        }

        log.info("SEO_LANE anti_ai_one_shot done creativeKeys={} articleRawChars={} missingAfter={}",
            creative.keySet(),
            normalized == null ? 0 : normalized.length(),
            countMissingRequiredFields(parseSeoArticleMap(normalized)));
        return normalized;
    }

    /** Chọn persona/pattern/selling từ seed — không gọi LLM (giống random trong getAntiAIPrompt JS). */
    private Map<String, Object> resolveHeuristicCreativeParams(String seed, Map<String, Object> ctx) {
        Map<String, Object> creative = new LinkedHashMap<>();
        String topic = str(ctx.get("topic"), str(ctx.get("content"), ""));
        int hash = Math.abs((seed + "|" + topic).hashCode());
        creative.put("personaKey", pickFromList(DEFAULT_ANTI_AI_PERSONAS, hash, 0));
        creative.put("contentPattern", pickFromList(DEFAULT_ANTI_AI_PATTERNS, hash, 7));
        creative.put("sellingIntent", pickFromList(DEFAULT_ANTI_AI_SELLING, hash, 13));
        for (String key : List.of("personaKey", "contentPattern", "sellingIntent", "hook", "angle", "tone")) {
            if (ctx.containsKey(key) && ctx.get(key) != null && !String.valueOf(ctx.get(key)).isBlank()) {
                creative.put(key, ctx.get(key));
            }
        }
        String personaKey = str(creative.get("personaKey"), "investor");
        if (!creative.containsKey("hook") || str(creative.get("hook"), "").isBlank()) {
            creative.put("hook", defaultHookForPersona(personaKey, topic));
        }
        if (!creative.containsKey("angle") || str(creative.get("angle"), "").isBlank()) {
            creative.put("angle", defaultAngleForPersona(personaKey));
        }
        if (!creative.containsKey("tone") || str(creative.get("tone"), "").isBlank()) {
            creative.put("tone", defaultToneForPersona(personaKey));
        }
        return creative;
    }

    private static String pickFromList(List<String> items, int hash, int salt) {
        if (items == null || items.isEmpty()) {
            return "";
        }
        int idx = Math.floorMod(hash + salt, items.size());
        return items.get(idx);
    }

    private static String defaultHookForPersona(String personaKey, String topic) {
        String snippet = topic.length() > 40 ? topic.substring(0, 40).trim() + "..." : topic;
        return switch (personaKey) {
            case "family" -> "Gia đình tôi đang tìm " + snippet;
            case "business_owner" -> "Mở quán tại " + snippet;
            case "local_resident" -> "Sống lâu năm quanh " + snippet;
            case "storyteller" -> "Câu chuyện thật về " + snippet;
            default -> "Góc nhìn đầu tư " + snippet;
        };
    }

    private static String defaultAngleForPersona(String personaKey) {
        return switch (personaKey) {
            case "family" -> "Trải nghiệm thực tế, ưu tiên không gian sống";
            case "business_owner" -> "Tiềm năng kinh doanh và dòng khách";
            case "local_resident" -> "Am hiểu khu vực, tiện ích hàng ngày";
            case "storyteller" -> "Kể chuyện có nhân vật, có chi tiết cụ thể";
            default -> "Phân tích số liệu, so sánh và rủi ro";
        };
    }

    private static String defaultToneForPersona(String personaKey) {
        return switch (personaKey) {
            case "family" -> "Ấm áp, gần gũi, thực tế";
            case "business_owner" -> "Thực dụng, tập trung ROI";
            case "local_resident" -> "Tự nhiên, như người trong cuộc";
            case "storyteller" -> "Kể chuyện, có cảm xúc";
            default -> "Chuyên gia, có số liệu";
        };
    }

    /**
     * Một HTTP SEO: parse + tối đa 1 retry nếu thiếu field / copy locale — không gọi LLM dịch riêng.
     */
    public String postProcessSeoRaw(
            String articleRaw,
            String topicHint,
            AiAssistantGatewayService.ProgressListener progressListener) {
        String topic = str(topicHint, "");
        Map<String, Object> ctx = Map.of("topic", topic);
        Map<String, Object> creative = resolveHeuristicCreativeParams(
            System.currentTimeMillis() + "_" + Math.abs(topic.hashCode()), ctx);
        return finalizeSeoArticle(articleRaw, "bat-dong-san", topic, "lmkt", creative, ctx, progressListener);
    }

    /** Lấy topic từ prompt LMKT getAntiAIPrompt ([TOPIC]: "..."). */
    public static String extractTopicFromPrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return "";
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("\\[TOPIC\\]:\\s*\"([^\"]+)\"", java.util.regex.Pattern.CASE_INSENSITIVE)
            .matcher(prompt);
        if (m.find()) {
            return m.group(1).trim();
        }
        m = java.util.regex.Pattern.compile("\\[SOURCE_TEXT\\]:\\s*\"?([^\"\\n]{20,})")
            .matcher(prompt);
        if (m.find()) {
            return m.group(1).trim();
        }
        return "";
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
        fillMissingSeoMetaFields(merged);
        fillDerivedLocaleMetaFields(merged);
        int missing = countMissingRequiredFields(merged);
        boolean errorJson = isProviderErrorJson(articleRaw);
        boolean templateEcho = isSeoTemplateEcho(merged);

        boolean localeBad = needsLocaleTranslate(merged);

        if (hasCompleteTrilingualSeo(merged)) {
            return serializeSeoArticleOrThrow(merged);
        }

        promotePartialSeoFields(merged);
        if (hasRecoverableSeoContent(merged) && localeBad && missing > 0 && missing <= 8) {
            log.info("SEO_LANE VI ok — locale translate trước retry (missing={} localeBad={})", missing, localeBad);
            ensureTrilingualLocales(merged, progressListener);
            fillDerivedLocaleMetaFields(merged);
            if (hasCompleteTrilingualSeo(merged) || hasMinimalTrilingualSeo(merged)) {
                return serializeSeoArticleOrThrow(merged);
            }
            missing = countMissingRequiredFields(merged);
            localeBad = needsLocaleTranslate(merged);
        }

        if (articleRetryEnabled && (errorJson || templateEcho || missing > 0 || merged.isEmpty() || localeBad)) {
            log.info("SEO_LANE article retry once (errorJson={} templateEcho={} localeBad={} missingFields={})",
                errorJson, templateEcho, localeBad, missing);
            if (progressListener != null) {
                progressListener.onProgress(Map.of(
                    "stage", "seo_article_retry",
                    "message", "Model thiếu field hoặc EN/ZH chưa đúng — retry 1 lần (cùng HTTP)...",
                    "percent", 70));
            }
            String retryPrompt;
            if (looksLikeTruncatedSeoJson(articleRaw) || missing >= 10) {
                log.info("SEO_LANE retry with full compact prompt (truncated={} missing={})",
                    looksLikeTruncatedSeoJson(articleRaw), missing);
                retryPrompt = buildCompactAntiAiArticlePrompt(industry, topic, domainKey, creative, ctx)
                    + """

                    [RETRY — JSON LẦN TRƯỚC BỊ CẮT HOẶC THIẾU]
                    Viết NGẮN GỌN để vừa token: content VI ~350 từ HTML, content_en/content_zh ~120 từ mỗi bài.
                    Đủ 15 keys VI+EN+ZH. Đóng JSON đúng cú pháp. KHÔNG markdown.
                    """;
            } else {
                retryPrompt = buildSeoArticleRetryPrompt(industry, topic, domainKey, creative, ctx, merged);
            }
            int scoreBeforeRetry = scoreFilledSeoFields(merged);
            String retryRaw = aiAssistantGatewayService.generateSeoContent(retryPrompt, progressListener);
            Map<String, Object> retryParsed = parseSeoArticleMap(retryRaw);
            if (scoreFilledSeoFields(retryParsed) > scoreBeforeRetry) {
                mergeSeoArticleMaps(merged, retryParsed);
            } else {
                log.info("SEO_LANE retry merge skipped (score {} <= {})",
                    scoreFilledSeoFields(retryParsed), scoreBeforeRetry);
            }
            fillMissingSeoMetaFields(merged);
            fillDerivedLocaleMetaFields(merged);
            localeBad = needsLocaleTranslate(merged);
            missing = countMissingRequiredFields(merged);
            if (hasCompleteTrilingualSeo(merged)) {
                return serializeSeoArticleOrThrow(merged);
            }
        }

        if (shouldRunLocaleTranslateFallback(merged, localeBad)) {
            log.info("SEO_LANE locale fallback (VI ok, EN/ZH thiếu hoặc copy VI)");
            ensureTrilingualLocales(merged, progressListener);
            fillDerivedLocaleMetaFields(merged);
            localeBad = needsLocaleTranslate(merged);
            if (hasCompleteTrilingualSeo(merged) || hasMinimalTrilingualSeo(merged)) {
                return serializeSeoArticleOrThrow(merged);
            }
        }

        fillDerivedLocaleMetaFields(merged);
        if (hasMinimalTrilingualSeo(merged)) {
            log.info("SEO_LANE accept minimal trilingual (core 6 fields + derived meta)");
            return serializeSeoArticleOrThrow(merged);
        }

        return createSeoLaneErrorJson(
            "Model local chưa trả đủ bài SEO 3 ngôn ngữ. Đã thử retry"
                + (localeTranslateFallbackEnabled ? " + dịch EN/ZH" : "")
                + " — thử lại hoặc tăng ai.seo.article.max-tokens.",
            "SEO_GENERATION_FAILED");
    }

    /**
     * Pass 1 chỉ VI (model 1.5B) → pass 2 dịch EN/ZH. Tránh JSON 15 keys + {@code ...} ellipsis.
     */
    private String finalizeViFirstSeoArticle(
            String articleRaw,
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx,
            AiAssistantGatewayService.ProgressListener progressListener) {
        Map<String, Object> merged = parseSeoArticleMap(articleRaw);
        promotePartialSeoFields(merged);
        fillMissingSeoMetaFields(merged);

        if (!hasRecoverableSeoContent(merged) && articleRetryEnabled) {
            log.info("SEO_LANE VI-first retry (no recoverable VI content)");
            if (progressListener != null) {
                progressListener.onProgress(Map.of(
                    "stage", "seo_article_retry",
                    "message", "Bài tiếng Việt chưa đủ — retry 1 lần...",
                    "percent", 55));
            }
            String retryPrompt = buildCompactViOnlyArticlePrompt(industry, topic, domainKey, creative, ctx)
                + """

                [RETRY] JSON lần trước thiếu hoặc có dấu ... — viết LẠI đủ field tiếng Việt.
                Cấm dùng ... hoặc bỏ trống field. content HTML ~350-500 từ.
                """;
            Map<String, Object> retryParsed = parseSeoArticleMap(
                aiAssistantGatewayService.generateSeoContent(retryPrompt, progressListener));
            if (scoreFilledSeoFields(retryParsed) > scoreFilledSeoFields(merged)) {
                merged = retryParsed;
                promotePartialSeoFields(merged);
                fillMissingSeoMetaFields(merged);
            }
        }

        if (!hasRecoverableSeoContent(merged)) {
            return createSeoLaneErrorJson(
                "Model local chưa viết được bài tiếng Việt. Thử lại hoặc gửi prompt đầy đủ từ client.",
                "SEO_GENERATION_FAILED");
        }

        log.info("SEO_LANE VI-first ok titleChars={} contentChars={} — dịch EN/ZH",
            String.valueOf(merged.get("title")).length(),
            String.valueOf(merged.get("content")).length());

        ensureTrilingualLocalesForViFirst(merged, progressListener);
        fillDerivedLocaleMetaFields(merged);
        syncAttributesFromLocales(merged);

        if (hasCompleteTrilingualSeo(merged) || hasMinimalTrilingualSeo(merged)) {
            return serializeSeoArticleOrThrow(merged);
        }

        log.warn("SEO_LANE VI-first reject: {}", describeMinimalSeoGap(merged));
        return createSeoLaneErrorJson(
            "Model local chưa dịch đủ EN/ZH sau bài tiếng Việt. Thử lại.",
            "SEO_GENERATION_FAILED");
    }

    private static String describeMinimalSeoGap(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return "empty_payload";
        }
        java.util.List<String> issues = new java.util.ArrayList<>();
        for (String field : SEO_CORE_LOCALE_FIELDS) {
            if (isBlank(payload.get(field))) {
                issues.add("missing:" + field);
            }
        }
        if (isCoreLocaleCopyViolation(payload)) {
            issues.add("core_locale_copy_or_vn_in_en");
        }
        issues.add("localeFilled=" + countFilledLocaleFields(payload) + "/" + SEO_LOCALE_FIELDS.size());
        return String.join(", ", issues);
    }

    /** VI-first: dịch EN và ZH riêng (2 lần gọi nhỏ — phù hợp model 1.5B). */
    private void ensureTrilingualLocalesForViFirst(
            Map<String, Object> payload,
            AiAssistantGatewayService.ProgressListener progressListener) {
        if (!localeTranslateFallbackEnabled && !localeTranslateEnabled) {
            return;
        }
        if (isBlank(payload.get("title")) || isBlank(payload.get("content"))) {
            return;
        }
        clearStaleLocaleCopies(payload);

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_locale_translate",
                "message", "Đang dịch sang tiếng Anh...",
                "percent", 82));
        }
        translateSingleLocale(payload, "en", progressListener);

        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_locale_translate",
                "message", "Đang dịch sang tiếng Trung...",
                "percent", 88));
        }
        translateSingleLocale(payload, "zh", progressListener);

        if (hasMinimalTrilingualSeo(payload)) {
            log.info("SEO_LANE locale split ok (en+zh)");
            return;
        }

        log.info("SEO_LANE locale split retry combined (gap={})", describeMinimalSeoGap(payload));
        clearStaleLocaleCopies(payload);
        String raw = aiAssistantGatewayService.generateSeoContent(
            buildMinimalLocaleTranslatePrompt(payload), progressListener);
        mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw));
    }

    /** Xóa field EN/ZH đang copy VI hoặc còn tiếng Việt — tránh merge bỏ qua bản dịch mới. */
    private void clearStaleLocaleCopies(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        for (String field : SEO_CORE_LOCALE_FIELDS) {
            if (field.equals("title") || field.equals("content")) {
                continue;
            }
            Object val = payload.get(field);
            if (isBlank(val)) {
                continue;
            }
            if (isSeoLocaleFieldCopyOfVi(field, val, payload)
                    || (field.endsWith("_en") && containsVietnamese(val))) {
                payload.remove(field);
            }
        }
        for (String field : SEO_LOCALE_FIELDS) {
            Object val = payload.get(field);
            if (isBlank(val)) {
                continue;
            }
            if (isSeoLocaleFieldCopyOfVi(field, val, payload)
                    || (field.endsWith("_en") && containsVietnamese(val))) {
                payload.remove(field);
            }
        }
    }

    private void translateSingleLocale(
            Map<String, Object> payload,
            String lang,
            AiAssistantGatewayService.ProgressListener progressListener) {
        if (!needsSingleLocaleTranslate(payload, lang)) {
            return;
        }
        log.info("SEO_LANE locale translate {} (title+content)", lang);
        String raw = aiAssistantGatewayService.generateSeoContent(
            buildSingleLocaleTranslatePrompt(payload, lang), progressListener);
        mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw));
    }

    private static boolean needsSingleLocaleTranslate(Map<String, Object> payload, String lang) {
        String titleKey = "title_" + lang;
        String contentKey = "content_" + lang;
        if (isBlank(payload.get(titleKey)) || isBlank(payload.get(contentKey))) {
            return true;
        }
        if (isSeoLocaleFieldCopyOfVi(titleKey, payload.get(titleKey), payload)
                || isSeoLocaleFieldCopyOfVi(contentKey, payload.get(contentKey), payload)) {
            return true;
        }
        return "en".equals(lang) && (
            containsVietnamese(payload.get(titleKey)) || containsVietnamese(payload.get(contentKey)));
    }

    private void ensureTrilingualLocalesWithRetry(
            Map<String, Object> payload,
            AiAssistantGatewayService.ProgressListener progressListener) {
        ensureTrilingualLocales(payload, progressListener);
        int filled = countFilledLocaleFields(payload);
        if (filled >= SEO_LOCALE_FIELDS.size()) {
            return;
        }
        if (!localeTranslateFallbackEnabled && !localeTranslateEnabled) {
            return;
        }
        if (!needsLocaleTranslate(payload)) {
            return;
        }
        log.info("SEO_LANE locale translate retry (filled={}/{})", filled, SEO_LOCALE_FIELDS.size());
        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_locale_translate_retry",
                "message", "Dịch EN/ZH lần 2 (4 field cốt lõi)...",
                "percent", 88));
        }
        String raw = aiAssistantGatewayService.generateSeoContent(
            buildMinimalLocaleTranslatePrompt(payload), progressListener);
        mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw));
        fillDerivedLocaleMetaFields(payload);
        log.info("SEO_LANE locale after retry filled={}/{}", countFilledLocaleFields(payload), SEO_LOCALE_FIELDS.size());
    }

    private static int countFilledLocaleFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (String field : SEO_LOCALE_FIELDS) {
            if (!isBlank(payload.get(field))) {
                n++;
            }
        }
        return n;
    }

    private boolean shouldRunLocaleTranslateFallback(Map<String, Object> merged, boolean localeBad) {
        if (!localeTranslateFallbackEnabled && !localeTranslateEnabled) {
            return false;
        }
        return hasRecoverableSeoContent(merged) && (localeBad || !hasMinimalTrilingualSeo(merged));
    }

    private String serializeSeoArticleOrThrow(Map<String, Object> merged) {
        sanitizeSeoTextFields(merged);
        syncAttributesFromLocales(merged);
        try {
            return serializeSeoArticleJson(merged);
        } catch (Exception ex) {
            log.warn("SEO article serialize failed: {}", ex.getMessage());
            return createSeoLaneErrorJson("Không serialize được JSON bài SEO.", "SEO_SERIALIZE_FAILED");
        }
    }

    private String createSeoLaneErrorJson(String message, String errorCode) {
        try {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("errorCode", errorCode);
            err.put("message", message);
            err.put("provider", "local_provider");
            err.put("timestamp", System.currentTimeMillis());
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(err);
        } catch (Exception ex) {
            return "{\"success\":false,\"errorCode\":\"" + errorCode + "\",\"provider\":\"local_provider\"}";
        }
    }

    /** Core VI+EN+ZH: title + content mỗi ngôn ngữ, không copy locale. */
    public static boolean hasMinimalTrilingualSeo(Map<String, Object> payload) {
        if (!hasRecoverableSeoContent(payload)) {
            return false;
        }
        for (String field : SEO_CORE_LOCALE_FIELDS) {
            if (isBlank(payload.get(field))) {
                return false;
            }
        }
        return !isCoreLocaleCopyViolation(payload);
    }

    private static boolean isCoreLocaleCopyViolation(Map<String, Object> payload) {
        return sameNormalizedField(payload, "title", "title_en")
            || sameNormalizedField(payload, "title", "title_zh")
            || sameNormalizedField(payload, "content", "content_en")
            || sameNormalizedField(payload, "content", "content_zh")
            || containsVietnamese(payload.get("title_en"))
            || containsVietnamese(payload.get("content_en"));
    }

    /** description/keywords/excerpt lấy từ content cùng ngôn ngữ — không copy VI sang EN/ZH. */
    public void fillDerivedLocaleMetaFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        fillIfBlank(payload, "description", plainTextExcerpt(payload.get("content"), 160));
        fillIfBlank(payload, "description_en", plainTextExcerpt(payload.get("content_en"), 160));
        fillIfBlank(payload, "description_zh", plainTextExcerpt(payload.get("content_zh"), 160));
        fillIfBlank(payload, "excerpt",
            payload.get("description"), plainTextExcerpt(payload.get("content"), 320));
        fillIfBlank(payload, "excerpt_en",
            payload.get("description_en"), plainTextExcerpt(payload.get("content_en"), 320));
        fillIfBlank(payload, "excerpt_zh",
            payload.get("description_zh"), plainTextExcerpt(payload.get("content_zh"), 320));
        fillIfBlank(payload, "keywords",
            keywordsFromTitle(payload.get("title"), payload.get("keywords")));
        fillIfBlank(payload, "keywords_en",
            keywordsFromTitle(payload.get("title_en"), payload.get("keywords_en")));
        fillIfBlank(payload, "keywords_zh",
            keywordsFromTitle(payload.get("title_zh"), payload.get("keywords_zh")));
    }

    /** Đủ title/content VI + toàn bộ field EN/ZH, không copy locale. */
    public static boolean hasCompleteTrilingualSeo(Map<String, Object> payload) {
        if (!hasMinimalTrilingualSeo(payload)) {
            return false;
        }
        for (String field : SEO_REQUIRED_FIELDS) {
            if (isBlank(payload.get(field))) {
                return false;
            }
        }
        return !isSeoLocaleCopyViolation(payload);
    }

    private String buildSeoArticleRetryPrompt(
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx,
            Map<String, Object> partial) {
        StringBuilder issues = new StringBuilder();
        for (String field : SEO_REQUIRED_FIELDS) {
            if (isBlank(partial.get(field))) {
                if (issues.length() > 0) issues.append(", ");
                issues.append("thiếu ").append(field);
            }
        }
        if (isSeoLocaleCopyViolation(partial)) {
            if (issues.length() > 0) issues.append("; ");
            issues.append("EN/ZH copy tiếng Việt — phải dịch thật");
        }
        String persona = str(creative.get("personaKey"), "storyteller");
        String angle = str(creative.get("angle"), topic);
        return """
            VIẾT 1 JSON HOÀN CHỈNH — ĐỦ 3 NGÔN NGỮ TRONG 1 LẦN (KHÔNG markdown, KHÔNG giải thích).

            SOURCE_TEXT / Topic: %s
            Industry: %s | Domain: %s | Persona: %s | Angle: %s
            Lỗi lần trước: %s

            BẮT BUỘC trả đủ 15 keys trong 1 JSON:
            title, title_en, title_zh, description, description_en, description_zh,
            content, content_en, content_zh, keywords, keywords_en, keywords_zh,
            excerpt, excerpt_en, excerpt_zh (+ author, readTime, tags nếu có)

            🇻🇳 VI: title, description, content, keywords, excerpt — tiếng Việt, content HTML h3/h4/p
            🇬🇧 EN: *_en — tiếng Anh THẬT, KHÁC hoàn toàn bản VI, content_en HTML tiếng Anh
            🇨🇳 ZH: *_zh — tiếng Trung Giản thể THẬT, KHÁC bản VI, content_zh HTML tiếng Trung
            description/excerpt*: văn bản thuần, KHÔNG thẻ HTML
            KHÔNG copy title/content sang _en/_zh. KHÔNG placeholder schema.
            """.formatted(topic, industry, domainKey, persona, angle,
            issues.length() > 0 ? issues : "thiếu hoặc sai locale");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseSeoArticleMap(String articleRaw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (articleRaw == null || articleRaw.isBlank()) {
            return out;
        }
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String innerText = extractInnerSeoText(articleRaw);
        try {
            String text = extractJsonBlockFromText(innerText);
            if (!text.isBlank()) {
                text = cleanupLazyJsonEllipsis(text);
                mergeParsedSeoJson(out, mapper, text);
                if (out.isEmpty()) {
                    String repaired = repairTruncatedJson(text);
                    if (!repaired.equals(text)) {
                        mergeParsedSeoJson(out, mapper, repaired);
                    }
                }
            }
            if (out.isEmpty()) {
                mergeSeoArticleMaps(out, salvageSeoFieldsFromText(innerText.isBlank() ? articleRaw : innerText));
            }
            promotePartialSeoFields(out);
            fillMissingSeoMetaFields(out);
            normalizeSeoArticleForLmktClient(out);
        } catch (Exception ex) {
            log.warn("SEO parseSeoArticleMap failed: {}", ex.getMessage());
            mergeSeoArticleMaps(out, salvageSeoFieldsFromText(innerText.isBlank() ? articleRaw : innerText));
            promotePartialSeoFields(out);
            fillMissingSeoMetaFields(out);
            normalizeSeoArticleForLmktClient(out);
        }
        return out;
    }

    private String extractInnerSeoText(String articleRaw) {
        String text = aiAssistantGatewayService.extractProviderText(articleRaw);
        if (text == null || text.isBlank()) {
            text = articleRaw.trim();
        }
        return sanitizeSeoLlmOutput(text);
    }

    @SuppressWarnings("unchecked")
    private void mergeParsedSeoJson(
            Map<String, Object> out,
            com.fasterxml.jackson.databind.ObjectMapper mapper,
            String text) {
        try {
            Map<String, Object> parsed = mapper.readValue(text, Map.class);
            if (isSeoArticleShape(parsed)) {
                mergeSeoArticleMaps(out, parsed);
            } else if (parsed.get("data") instanceof Map<?, ?> dataMap) {
                Map<String, Object> nested = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : dataMap.entrySet()) {
                    if (e.getKey() != null) nested.put(String.valueOf(e.getKey()), e.getValue());
                }
                if (isSeoArticleShape(nested)) {
                    mergeSeoArticleMaps(out, nested);
                }
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException jpe) {
            log.warn("SEO JSON parse partial: {}", jpe.getMessage());
            mergeSeoArticleMaps(out, salvageSeoFieldsFromText(text));
        }
    }

    /** description HTML từ JSON cắt cụt → dùng làm content để locale fallback/recover. */
    private static void promotePartialSeoFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        if (isBlank(payload.get("content")) && !isBlank(payload.get("description"))) {
            String desc = String.valueOf(payload.get("description"));
            if (desc.contains("<p>") || desc.contains("<h3>") || desc.contains("<h4>")) {
                payload.put("content", desc);
            }
        }
    }

    private static boolean looksLikeTruncatedSeoJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        String text = sanitizeSeoLlmOutput(raw);
        if (!text.contains("\"title\"")) {
            return false;
        }
        text = extractJsonBlockFromText(text);
        if (text.isBlank()) {
            return true;
        }
        String trimmed = text.trim();
        if (!trimmed.endsWith("}")) {
            return true;
        }
        try {
            new com.fasterxml.jackson.databind.ObjectMapper().readValue(trimmed, Map.class);
            return false;
        } catch (Exception ex) {
            return true;
        }
    }

    /** Đóng chuỗi JSON và ngoặc nhọn khi model bị cắt giữa output token. */
    static String repairTruncatedJson(String text) {
        if (text == null || text.isBlank()) {
            return text == null ? "" : text;
        }
        String t = text.trim();
        boolean inString = false;
        boolean escaped = false;
        int openBraces = 0;
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                openBraces++;
            } else if (c == '}') {
                openBraces--;
            }
        }
        StringBuilder sb = new StringBuilder(t);
        if (inString) {
            sb.append('"');
        }
        for (int i = 0; i < openBraces; i++) {
            sb.append('}');
        }
        return sb.toString();
    }

    private static boolean isSeoArticleShape(Map<String, Object> parsed) {
        if (parsed == null || parsed.isEmpty()) {
            return false;
        }
        return parsed.containsKey("title")
            || parsed.containsKey("content")
            || parsed.containsKey("html_content")
            || parsed.containsKey("description")
            || parsed.containsKey("attributes_title");
    }

    private static boolean hasRecoverableSeoContent(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return false;
        }
        String title = String.valueOf(payload.getOrDefault("title",
            payload.getOrDefault("attributes_title", ""))).trim();
        String body = String.valueOf(payload.getOrDefault("content",
            payload.getOrDefault("html_content", ""))).trim();
        if (body.isEmpty() && !isBlank(payload.get("description"))) {
            body = String.valueOf(payload.get("description")).trim();
        }
        if (title.isEmpty() || body.isEmpty()) {
            return false;
        }
        if (isSeoTemplateEcho(payload)) {
            return false;
        }
        return true;
    }

    /**
     * Model local hay copy nguyên mô tả schema trong prompt thay vì viết bài thật.
     */
    public static boolean isSeoTemplateEcho(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return false;
        }
        String title = lower(payload.get("title"));
        String content = lower(payload.get("content"));
        if (content.isBlank()) {
            content = lower(payload.get("html_content"));
        }
        String description = lower(payload.get("description"));
        String combined = title + " " + content + " " + description;
        if (combined.isBlank()) {
            return false;
        }
        String[] markers = {
            "55-80 ký tự", "benefit-driven", "english title 55-80",
            "html tiếng việt theo pattern", "english html (shorter)",
            "中文 html (shorter)", "persona label", "5-8 từ khóa",
            "280-350 ký tự sapo", "<h3>...</h3>", "150-160 ký tự",
            "150-160 chars", "150-160字符", "5-8 keywords", "5-8关键词"
        };
        int hits = 0;
        for (String marker : markers) {
            if (combined.contains(marker)) {
                hits++;
            }
        }
        if (hits >= 2) {
            return true;
        }
        if (title.contains("55-80") && content.contains("theo pattern")) {
            return true;
        }
        if (content.contains("<h3>...</h3>") || content.contains("html tiếng việt theo pattern")) {
            return true;
        }
        // Body quá ngắn + title giống mô tả schema
        if (content.length() < 120 && (title.contains("ký tự") || title.contains("chars"))) {
            return true;
        }
        return false;
    }

    private static String lower(Object value) {
        return String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Align pipeline output with lmkt auto-lmkt.js getAntiAIPrompt / buildDetail schema.
     * Also mirrors attributes_* for legacy LMKT DB columns.
     */
    public void normalizeSeoArticleForLmktClient(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        fillIfBlank(payload, "title", payload.get("attributes_title"));
        fillIfBlank(payload, "title_en", payload.get("attributes_title_en"));
        fillIfBlank(payload, "title_zh", payload.get("attributes_title_zh"));
        fillIfBlank(payload, "description", payload.get("attributes_description"));
        fillIfBlank(payload, "description_en", payload.get("attributes_description_en"));
        fillIfBlank(payload, "description_zh", payload.get("attributes_description_zh"));
        fillIfBlank(payload, "keywords", payload.get("attributes_keywords"));
        fillIfBlank(payload, "keywords_en", payload.get("attributes_keywords_en"));
        fillIfBlank(payload, "keywords_zh", payload.get("attributes_keywords_zh"));

        String titlePlain = plainTextExcerpt(payload.get("title"), 200);
        if (!titlePlain.isBlank()) {
            payload.put("title", titlePlain);
        }

        fillMissingSeoMetaFields(payload);
        sanitizeSeoTextFields(payload);

        fillIfBlank(payload, "attributes_title", payload.get("title"));
        fillIfBlank(payload, "attributes_title_en", payload.get("title_en"));
        fillIfBlank(payload, "attributes_title_zh", payload.get("title_zh"));
        fillIfBlank(payload, "attributes_description", payload.get("description"));
        fillIfBlank(payload, "attributes_description_en", payload.get("description_en"));
        fillIfBlank(payload, "attributes_description_zh", payload.get("description_zh"));
        fillIfBlank(payload, "attributes_keywords", payload.get("keywords"));
        fillIfBlank(payload, "attributes_keywords_en", payload.get("keywords_en"));
        fillIfBlank(payload, "attributes_keywords_zh", payload.get("keywords_zh"));

        if (payload.get("html_content") == null && !isBlank(payload.get("content"))) {
            payload.put("html_content", payload.get("content"));
        }
    }

    private String serializeSeoArticleJson(Map<String, Object> merged) throws Exception {
        normalizeSeoArticleForLmktClient(merged);
        return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(merged);
    }

    /** Pick the JSON object with the most filled SEO fields from noisy LLM output. */
    static String extractJsonBlockFromText(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String t = sanitizeSeoLlmOutput(text);
        int retryCut = t.indexOf("[RETRY]");
        if (retryCut > 0) {
            t = t.substring(0, retryCut).trim();
        }
        t = t.replace("Không cần explanation.", "").trim();

        String bestJson = null;
        int bestScore = -1;
        for (int i = 0; i < t.length(); i++) {
            if (t.charAt(i) != '{') {
                continue;
            }
            int end = findMatchingJsonBrace(t, i);
            if (end <= i) {
                continue;
            }
            String candidate = t.substring(i, end + 1);
            try {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                Map<String, Object> parsed = mapper.readValue(candidate, Map.class);
                if (!isSeoArticleShape(parsed)) {
                    continue;
                }
                int score = scoreFilledSeoFields(parsed);
                if (score > bestScore) {
                    bestScore = score;
                    bestJson = candidate;
                }
            } catch (Exception ignored) {
                // try next block
            }
        }
        if (bestJson != null) {
            return bestJson;
        }

        int start = t.indexOf('{');
        int end = start >= 0 ? findMatchingJsonBrace(t, start) : -1;
        if (start >= 0 && end > start) {
            return t.substring(start, end + 1);
        }
        return t;
    }

    /** Strip markdown fences and common local-model preambles before JSON parse. */
    static String sanitizeSeoLlmOutput(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String t = text.trim();
        if (t.contains("```")) {
            int jsonFence = t.toLowerCase(Locale.ROOT).indexOf("```json");
            if (jsonFence >= 0) {
                t = t.substring(jsonFence + 7);
            } else {
                int fence = t.indexOf("```");
                t = t.substring(fence + 3);
            }
            int close = t.indexOf("```");
            if (close >= 0) {
                t = t.substring(0, close);
            }
            t = t.trim();
        }
        t = t.replaceFirst("(?is)^\\{\\s*or\\s*\\[\\.?\\s*", "");
        t = t.replaceFirst("(?is)^[^\\{]*(\\{)", "$1");
        return cleanupLazyJsonEllipsis(t.trim());
    }

    /** Model 1.5B hay chèn {@code ...} thay vì viết hết JSON — loại bỏ trước khi parse. */
    static String cleanupLazyJsonEllipsis(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String t = text;
        t = t.replaceAll("(?m)^\\s*\\.\\.\\.\\s*,?\\s*$", "");
        t = t.replaceAll(",\\s*\\.\\.\\.\\s*(?=\\n|\\})", "");
        t = t.replaceAll(",\\s*\\.\\.\\.\\s*,", ",");
        t = t.replaceAll("\\{\\s*\\.\\.\\.\\s*,", "{");
        t = t.replaceAll(",(\\s*[}\\]])", "$1");
        return t.trim();
    }

    /** Regex salvage when JSON is wrapped/truncated but title/content are readable. */
    private static Map<String, Object> salvageSeoFieldsFromText(String text) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (text == null || text.isBlank()) {
            return out;
        }
        String source = sanitizeSeoLlmOutput(text);
        for (String field : SEO_REQUIRED_FIELDS) {
            salvageJsonStringField(out, source, field);
        }
        return out;
    }

    private static void salvageJsonStringField(Map<String, Object> target, String text, String field) {
        if (target.containsKey(field) && !isBlank(target.get(field))) {
            return;
        }
        java.util.regex.Pattern closed = java.util.regex.Pattern.compile(
            "\"" + java.util.regex.Pattern.quote(field) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"",
            java.util.regex.Pattern.DOTALL);
        java.util.regex.Matcher matcher = closed.matcher(text);
        if (matcher.find()) {
            target.put(field, unescapeJsonString(matcher.group(1)));
            return;
        }
        java.util.regex.Pattern open = java.util.regex.Pattern.compile(
            "\"" + java.util.regex.Pattern.quote(field) + "\"\\s*:\\s*\"([\\s\\S]*)$",
            java.util.regex.Pattern.DOTALL);
        java.util.regex.Matcher openMatcher = open.matcher(text);
        if (openMatcher.find()) {
            String raw = openMatcher.group(1);
            int cut = raw.indexOf("\",\"" );
            if (cut >= 0) {
                raw = raw.substring(0, cut);
            }
            target.put(field, unescapeJsonString(raw));
        }
    }

    private static String unescapeJsonString(String raw) {
        if (raw == null) {
            return "";
        }
        return raw
            .replace("\\\"", "\"")
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
            .replace("\\\\", "\\")
            .trim();
    }

    private static int findMatchingJsonBrace(String text, int openIdx) {
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = openIdx; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
                continue;
            }
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private static int scoreFilledSeoFields(Map<String, Object> parsed) {
        int score = 0;
        for (String field : SEO_REQUIRED_FIELDS) {
            Object value = parsed.get(field);
            if (!isBlank(value)) {
                score++;
            }
        }
        return score;
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
        return sanitizeSeoLlmOutput(text);
    }

    public String normalizeSeoArticleJson(String articleRaw) {
        Map<String, Object> map = parseSeoArticleMap(articleRaw);
        if (map.isEmpty()) {
            return articleRaw;
        }
        try {
            return serializeSeoArticleJson(map);
        } catch (Exception ex) {
            log.warn("SEO normalize serialize failed: {}", ex.getMessage());
            return articleRaw;
        }
    }

    /**
     * Chỉ bổ sung field tiếng Việt còn thiếu. KHÔNG copy VI sang EN/ZH.
     */
    public void fillMissingSeoMetaFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }

        fillIfBlank(payload, "description",
            plainTextExcerpt(payload.get("content"), 160));
        fillIfBlank(payload, "keywords",
            keywordsFromTitle(payload.get("title"), payload.get("keywords")));
        fillIfBlank(payload, "excerpt",
            payload.get("description"),
            plainTextExcerpt(payload.get("content"), 320));

        fillIfBlank(payload, "author", "Chuyên gia BĐS");
        fillIfBlank(payload, "readTime", "8 phút");
        if (isBlank(payload.get("tags"))) {
            payload.put("tags", List.of("bat-dong-san"));
        }
        sanitizeSeoTextFields(payload);
    }

    /** @deprecated Chỉ dùng khi ai.seo.locale-translate.enabled=true — mặc định tắt; model phải trả đủ 3 ngôn ngữ 1 lần. */
    public void ensureTrilingualLocales(
            Map<String, Object> payload,
            AiAssistantGatewayService.ProgressListener progressListener) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        if (!localeTranslateEnabled && !localeTranslateFallbackEnabled) {
            return;
        }
        if (isBlank(payload.get("title")) || isBlank(payload.get("content"))) {
            return;
        }
        if (!needsLocaleTranslate(payload)) {
            return;
        }
        log.info("SEO_LANE locale translate (vi→en/zh) titleChars={} contentChars={}",
            String.valueOf(payload.get("title")).length(),
            String.valueOf(payload.get("content")).length());
        if (progressListener != null) {
            progressListener.onProgress(Map.of(
                "stage", "seo_locale_translate",
                "message", "Đang dịch EN/ZH từ bài tiếng Việt...",
                "percent", 85));
        }
        String prompt = buildLocaleTranslatePrompt(payload);
        String raw = aiAssistantGatewayService.generateSeoContent(prompt, progressListener);
        mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw));
        sanitizeSeoTextFields(payload);
        syncAttributesFromLocales(payload);
    }

    public static boolean needsLocaleTranslate(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return false;
        }
        if (isSeoLocaleCopyViolation(payload)) {
            return true;
        }
        for (String field : SEO_LOCALE_FIELDS) {
            if (isBlank(payload.get(field))) {
                return true;
            }
        }
        return false;
    }

    /** EN/ZH trùng VI hoặc vẫn còn tiếng Việt trong field _en/_zh. */
    public static boolean isSeoLocaleCopyViolation(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return false;
        }
        if (sameNormalizedField(payload, "title", "title_en")
                || sameNormalizedField(payload, "title", "title_zh")) {
            return true;
        }
        if (sameNormalizedField(payload, "content", "content_en")
                || sameNormalizedField(payload, "content", "content_zh")) {
            return true;
        }
        if (containsVietnamese(payload.get("title_en"))
                || containsVietnamese(payload.get("content_en"))) {
            return true;
        }
        if (sameNormalizedField(payload, "title", "title_zh")
                && containsVietnamese(payload.get("title_zh"))) {
            return true;
        }
        if (sameNormalizedField(payload, "content", "content_zh")
                && containsVietnamese(payload.get("content_zh"))) {
            return true;
        }
        return false;
    }

    private static boolean sameNormalizedField(Map<String, Object> payload, String a, String b) {
        String va = normalizeCompareText(payload.get(a));
        String vb = normalizeCompareText(payload.get(b));
        if (va.isEmpty() || vb.isEmpty()) {
            return false;
        }
        return va.equals(vb);
    }

    private static String normalizeCompareText(Object value) {
        return String.valueOf(value == null ? "" : value)
            .replaceAll("<[^>]+>", " ")
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase(Locale.ROOT);
    }

    private static boolean containsVietnamese(Object value) {
        String text = String.valueOf(value == null ? "" : value);
        if (text.isBlank()) {
            return false;
        }
        if (VIETNAMESE_DIACRITICS.matcher(text).find()) {
            return true;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        return lower.contains("căn hộ") || lower.contains("quận") || lower.contains(" tỷ")
            || lower.contains("phân tích:") || lower.contains("vị trí đắc địa");
    }

    private void mergeLocaleTranslateFields(Map<String, Object> target, Map<String, Object> translated) {
        if (target == null || translated == null || translated.isEmpty()) {
            return;
        }
        for (Map.Entry<String, Object> entry : translated.entrySet()) {
            String field = entry.getKey();
            if (field == null || (!field.endsWith("_en") && !field.endsWith("_zh"))) {
                continue;
            }
            Object value = entry.getValue();
            if (isBlank(value) || isSeoLocaleFieldCopyOfVi(field, value, target)) {
                continue;
            }
            Object existing = target.get(field);
            boolean existingBad = isBlank(existing)
                || isSeoLocaleFieldCopyOfVi(field, existing, target)
                || (field.endsWith("_en") && containsVietnamese(existing));
            if (existingBad || isBlank(existing)) {
                target.put(field, String.valueOf(value).trim());
            }
        }
    }

    private static boolean isSeoLocaleFieldCopyOfVi(String field, Object value, Map<String, Object> vi) {
        if (!field.endsWith("_en") && !field.endsWith("_zh")) {
            return false;
        }
        String viKey = field.substring(0, field.length() - 3);
        return normalizeCompareText(vi.get(viKey)).equals(normalizeCompareText(value));
    }

    private Map<String, Object> parseLocaleTranslateMap(String raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        try {
            String text = aiAssistantGatewayService.extractProviderText(raw);
            if (text == null || text.isBlank()) {
                text = raw.trim();
            }
            text = cleanupLazyJsonEllipsis(extractJsonBlockFromText(sanitizeSeoLlmOutput(text)));
            if (text.isBlank()) {
                return out;
            }
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            try {
                Map<String, Object> parsed = mapper.readValue(text, Map.class);
                for (Map.Entry<String, Object> entry : parsed.entrySet()) {
                    String field = entry.getKey();
                    if (field == null || isBlank(entry.getValue())) {
                        continue;
                    }
                    if (field.endsWith("_en") || field.endsWith("_zh")
                            || SEO_LOCALE_FIELDS.contains(field)) {
                        out.put(field, entry.getValue());
                    }
                }
            } catch (com.fasterxml.jackson.core.JsonProcessingException jpe) {
                log.warn("SEO locale translate parse partial: {}", jpe.getMessage());
                mergeLocaleTranslateFields(out, salvageSeoFieldsFromText(text));
            }
        } catch (Exception ex) {
            log.warn("SEO locale translate parse failed: {}", ex.getMessage());
            mergeLocaleTranslateFields(out, salvageSeoFieldsFromText(raw));
        }
        return out;
    }

    /** Dịch 4 field cốt lõi — prompt ngắn cho model yếu. */
    private String buildMinimalLocaleTranslatePrompt(Map<String, Object> vi) {
        String title = str(vi.get("title"), "");
        String content = str(vi.get("content"), str(vi.get("html_content"), ""));
        if (content.length() > 1800) {
            content = content.substring(0, 1800);
        }
        return ("""
            [SEO_LOCALE_TRANSLATE]
            Dịch sang tiếng Anh và tiếng Trung Giản thể. CHỈ 1 JSON, không markdown, không ...

            title VI: %s

            content VI HTML:
            %s

            JSON bắt buộc (4 keys):
            title_en, title_zh, content_en, content_zh

            title_en/title_zh: ~55-80 ký tự, KHÔNG tiếng Việt.
            content_en/content_zh: HTML cùng cấu trúc, dịch tự nhiên, KHÔNG copy VI.
            """).formatted(title, content).trim();
    }

    /** Một ngôn ngữ / một lần gọi — JSON 2 keys, dễ parse với model 1.5B. */
    private String buildSingleLocaleTranslatePrompt(Map<String, Object> vi, String lang) {
        String title = str(vi.get("title"), "");
        String content = str(vi.get("content"), str(vi.get("html_content"), ""));
        if (content.length() > 2200) {
            content = content.substring(0, 2200);
        }
        boolean en = "en".equalsIgnoreCase(lang);
        String langLabel = en ? "English" : "Simplified Chinese (简体中文)";
        String titleKey = en ? "title_en" : "title_zh";
        String contentKey = en ? "content_en" : "content_zh";
        return ("""
            [SEO_LOCALE_TRANSLATE]
            Translate Vietnamese real-estate SEO to %s ONLY.
            Return EXACTLY one JSON object with 2 keys: "%s", "%s".
            NO markdown. NO explanation. NO ellipsis (...). NO Vietnamese characters in output.

            Vietnamese title:
            %s

            Vietnamese content HTML:
            %s

            Rules:
            - %s: professional %s headline, 55-80 chars, must differ from Vietnamese title
            - %s: HTML (h3/h4/p), same structure, natural %s translation
            """).formatted(
            langLabel, titleKey, contentKey,
            title, content,
            titleKey, en ? "English" : "Chinese",
            contentKey, en ? "English" : "Chinese").trim();
    }

    private String buildLocaleTranslatePrompt(Map<String, Object> vi) {
        String title = str(vi.get("title"), "");
        String description = plainTextExcerpt(vi.get("description"), 200);
        if (description.isBlank()) {
            description = plainTextExcerpt(vi.get("content"), 200);
        }
        String content = str(vi.get("content"), str(vi.get("html_content"), ""));
        if (content.length() > 2800) {
            content = content.substring(0, 2800) + "...";
        }
        String keywords = str(vi.get("keywords"), "");
        String excerpt = plainTextExcerpt(vi.get("excerpt"), 320);
        if (excerpt.isBlank()) {
            excerpt = description;
        }
        return ("""
            [SEO_LOCALE_TRANSLATE]
            Dịch bài SEO tiếng Việt sang TIẾNG ANH và TIẾNG TRUNG (Giản thể).
            Trả về CHỈ 1 JSON object, không markdown, không giải thích.

            === TIẾNG VIỆT (nguồn) ===
            title: %s
            description: %s
            excerpt: %s
            keywords: %s
            content HTML:
            %s

            === OUTPUT JSON (bắt buộc) ===
            title_en, title_zh, description_en, description_zh, content_en, content_zh,
            keywords_en, keywords_zh, excerpt_en, excerpt_zh

            QUY TẮC:
            - title_en: tiếng Anh chuyên ngành BĐS, 55-80 ký tự, KHÔNG copy title VI
            - title_zh: tiếng Trung Giản thể, 55-80 ký tự, KHÔNG copy title VI
            - content_en: HTML tiếng Anh (giữ cấu trúc h3/h4/p), thoát ý, không word-by-word
            - content_zh: HTML tiếng Trung Giản thể, cùng cấu trúc
            - description_en/zh, excerpt_en/zh: văn bản thuần, KHÔNG thẻ HTML, 150-160 / 280-350 ký tự
            - keywords_en: từ khóa tiếng Anh, phẩy. keywords_zh: từ khóa tiếng Trung
            - TUYỆT ĐỐI KHÔNG để tiếng Việt trong field _en hoặc _zh
            """).formatted(title, description, excerpt, keywords, content).trim();
    }

    private void syncAttributesFromLocales(Map<String, Object> payload) {
        fillIfBlank(payload, "attributes_title_en", payload.get("title_en"));
        fillIfBlank(payload, "attributes_title_zh", payload.get("title_zh"));
        fillIfBlank(payload, "attributes_description_en", payload.get("description_en"));
        fillIfBlank(payload, "attributes_description_zh", payload.get("description_zh"));
        fillIfBlank(payload, "attributes_keywords_en", payload.get("keywords_en"));
        fillIfBlank(payload, "attributes_keywords_zh", payload.get("keywords_zh"));
    }

    /** Meta description/excerpt = plain text; readTime/keywords chuẩn hóa. */
    public void sanitizeSeoTextFields(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        for (String field : List.of(
                "description", "description_en", "description_zh",
                "excerpt", "excerpt_en", "excerpt_zh")) {
            if (!isBlank(payload.get(field))) {
                payload.put(field, plainTextExcerpt(payload.get(field), field.startsWith("excerpt") ? 350 : 160));
            }
        }
        for (String field : List.of("keywords", "keywords_en", "keywords_zh",
                "attributes_keywords", "attributes_keywords_en", "attributes_keywords_zh")) {
            if (!isBlank(payload.get(field))) {
                payload.put(field, normalizeKeywordsValue(payload.get(field)));
            }
        }
        Object readTime = payload.get("readTime");
        if (readTime != null) {
            String rt = String.valueOf(readTime).trim();
            if (rt.matches("\\d+")) {
                payload.put("readTime", rt + " phút");
            }
        }
    }

    private static String normalizeKeywordsValue(Object raw) {
        String text = String.valueOf(raw == null ? "" : raw).trim();
        if (text.startsWith("[") && text.endsWith("]")) {
            text = text.substring(1, text.length() - 1).trim();
        }
        return text.replaceAll("\\s*,\\s*", ", ").replaceAll("\\s+", " ").trim();
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

    /** Pass 1 — chỉ tiếng Việt; EN/ZH do ensureTrilingualLocales xử lý. */
    private String buildCompactViOnlyArticlePrompt(
            String industry,
            String topic,
            String domainKey,
            Map<String, Object> creative,
            Map<String, Object> ctx) {
        String personaKey = str(creative.get("personaKey"), "investor");
        String contentPattern = str(creative.get("contentPattern"), "landing_page");
        String hook = str(creative.get("hook"), "");
        String angle = str(creative.get("angle"), topic);
        String location = str(ctx.get("location"), "");
        String uniqueSeed = "[UNIQUE_" + System.currentTimeMillis() + "]";
        PersonaSpec persona = personaSpec(personaKey);
        String suggestedTitle = suggestTitleFromTopic(topic, personaKey, location);

        return ("""
            [SYSTEM CONFIG]: %s | Persona_%s | Pattern_%s
            [SOURCE_TEXT]: %s
            [INDUSTRY]: %s

            Viết bài SEO tiếng Việt. Trả CHỈ 1 JSON hợp lệ — KHÔNG markdown, KHÔNG giải thích.
            CẤM dùng dấu ... hoặc bỏ trống field. Mỗi value phải là nội dung THẬT từ SOURCE_TEXT.

            Keys (tiếng Việt only): title, description, content, keywords, excerpt, author, readTime, tags

            - title: "%s" hoặc hay hơn (~55-80 ký tự)
            - content: HTML h3/h4/p, %s từ, bám topic, tránh "vị trí đắc địa"
            - description/excerpt: văn bản thuần từ bài
            - author: "%s" | readTime: ước lượng | tags: ["%s"]
            - Hook: %s | Angle: %s | Giọng: %s

            KHÔNG có title_en, content_en hay bất kỳ field _en/_zh nào trong JSON này.
            """).formatted(
            uniqueSeed,
            personaKey,
            contentPattern,
            topic,
            industry,
            suggestedTitle,
            seoArticleTargetWordsVi,
            persona.label(),
            industry,
            hook,
            angle,
            persona.label()).trim();
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
        String business = str(ctx.get("business"), "");
        String uniqueSeed = "[UNIQUE_" + System.currentTimeMillis() + "]";
        PersonaSpec persona = personaSpec(personaKey);
        PatternSpec pattern = patternSpec(contentPattern);
        String structureGuide = buildLmktContentStructureGuide(contentPattern);
        String suggestedTitle = suggestTitleFromTopic(topic, personaKey, location);
        String realEstateRules = "bat-dong-san".equalsIgnoreCase(industry) || "lmkt".equalsIgnoreCase(domainKey)
            ? """

            ========== TRÍCH XUẤT BĐS (chỉ từ SOURCE_TEXT, không bịa) ==========
            attributes_area, attributes_dimensions, attributes_bedrooms, attributes_bathrooms, attributes_floors,
            attributes_frontWidth, attributes_roadWidth, attributes_location, attributes_price, attributes_contact,
            propertyType, transactionType, legalStatus, furnished — không có thì "".
            """
            : "";

        return ("""
            [SYSTEM CONFIG]: %s | Pattern_%s | Persona_%s | SellingIntent_%s
            [TOPIC]: "%s"
            [INDUSTRY]: %s

            [SOURCE_TEXT]:
            %s

            ========== METADATA GỢI Ý (tham khảo, viết lại cho hay hơn) ==========
            Tiêu đề gợi ý: "%s"
            Property: %s | Location: %s | Business: %s

            ========== BUYER PERSONA ==========
            %s — Mindset: "%s"
            Content angle: %s

            ========== CONTENT PATTERN ==========
            Pattern: %s | Tone: %s
            %s
            %s

            Hook: %s | Angle: %s | Tone viết: %s

            ANTI-AI VOICE: Tránh "vị trí đắc địa", "tiềm năng sinh lời", "sự kết hợp hoàn hảo".
            Dùng con số cụ thể từ SOURCE_TEXT, ví dụ thực tế, giọng %s.

            %s

            ========== YÊU CẦU ĐẦU RA ==========
            Viết bài SEO HOÀN CHỈNH dựa trên SOURCE_TEXT ở trên. Trả về CHỈ 1 JSON object hợp lệ.
            KHÔNG markdown ```json. KHÔNG giải thích. KHÔNG copy mô tả field — mỗi value phải là nội dung THẬT.

            Keys bắt buộc: title, title_en, title_zh, description, description_en, description_zh,
            content, content_en, content_zh, keywords, keywords_en, keywords_zh, excerpt, excerpt_en, excerpt_zh,
            author, readTime, tags.

            Quy tắc:
            - title: tiêu đề tiếng Việt thật về SOURCE_TEXT (~55-80 ký tự)
            - content: HTML tiếng Việt (h3/h4/p), %s từ, bám topic
            - description/excerpt: viết thật từ nội dung bài
            - author: "%s" | readTime: ước lượng | tags: ["%s"]
            - Trong JSON string dùng \\n thay xuống dòng. Kết thúc ngay sau } cuối.

            SAI (cấm trả về): "title":"55-80 ký tự, benefit-driven" hoặc "content":"<h3>...</h3><p>HTML tiếng Việt theo pattern..."
            ĐÚNG: title và content chứa thông tin cụ thể từ SOURCE_TEXT (địa chỉ, diện tích, giá nếu có).
            """).formatted(
            uniqueSeed,
            contentPattern,
            personaKey,
            sellingIntent,
            topic,
            industry,
            topic,
            suggestedTitle,
            property.isBlank() ? "(từ SOURCE_TEXT)" : property,
            location.isBlank() ? "(từ SOURCE_TEXT)" : location,
            business.isBlank() ? "(từ SOURCE_TEXT)" : business,
            persona.label(),
            persona.mindset(),
            persona.contentAngle(),
            pattern.name(),
            pattern.tone(),
            String.join(" → ", pattern.structure()),
            structureGuide,
            hook,
            angle,
            tone,
            persona.label(),
            realEstateRules,
            seoArticleTargetWordsVi,
            persona.label(),
            industry).trim();
    }

    private record PersonaSpec(String label, String mindset, String contentAngle) {}

    private record PatternSpec(String name, String tone, List<String> structure) {}

    private static PersonaSpec personaSpec(String key) {
        return switch (str(key, "investor")) {
            case "family" -> new PersonaSpec(
                "Gia Đình Trẻ",
                "Cần hốc tổ ấm, an toàn, gần trường tốt",
                "Câu chuyện gia đình — an ninh, tiện ích, cảm xúc");
            case "local_resident" -> new PersonaSpec(
                "Cư Dân Địa Phương",
                "Biết khu này thực tế, nói sự thật không quảng cáo",
                "Tâm sự thực tế — điểm tốt và tệ hàng ngày");
            case "business_owner" -> new PersonaSpec(
                "Chủ Doanh Nghiệp",
                "Bận rộn, cần giải pháp tiết kiệm thời gian, ROI rõ",
                "Giải pháp vấn đề — ROI, case study");
            case "storyteller" -> new PersonaSpec(
                "Người Kể Chuyện",
                "Chia sẻ kinh nghiệm, kết nối cộng đồng",
                "Kể chuyện cá nhân — hành trình, cảm xúc");
            default -> new PersonaSpec(
                "Nhà Đầu Tư Kinh Nghiệm",
                "Quan tâm dòng tiền, ROI, xu hướng thị trường",
                "Phân tích đầu tư — số liệu, so sánh, dự báo");
        };
    }

    private static PatternSpec patternSpec(String key) {
        return switch (str(key, "landing_page")) {
            case "investment_analysis" -> new PatternSpec(
                "Investment Analysis",
                "Chuyên sâu, có dữ liệu",
                List.of("Câu hỏi mở", "Dữ liệu", "So sánh", "Rủi ro", "Kết luận"));
            case "family_story" -> new PatternSpec(
                "Family Story",
                "Chân thực, cảm xúc",
                List.of("Nhân vật", "Nỗi đau", "Hành trình", "Quyết định", "Kết quả", "Lời khuyên"));
            case "step_by_step_guide" -> new PatternSpec(
                "Step-by-Step Guide",
                "Thực dụng, dễ hiểu",
                List.of("Vấn đề", "Bước 1-5", "Sai lầm", "FAQ"));
            case "quick_tips" -> new PatternSpec(
                "Quick Tips",
                "Trực tiếp, nhanh gọn",
                List.of("Hook", "Tip 1", "Tip 2", "Tip 3", "Kết luận"));
            default -> new PatternSpec(
                "Landing Page",
                "Thân thiện, tập trung lợi ích",
                List.of("Headline", "Intro", "Lợi ích", "Tính năng", "Social proof", "CTA"));
        };
    }

    private static String suggestTitleFromTopic(String topic, String personaKey, String location) {
        String base = topic.length() > 72 ? topic.substring(0, 72).trim() + "..." : topic.trim();
        if (!location.isBlank() && !base.toLowerCase(Locale.ROOT).contains(location.toLowerCase(Locale.ROOT))) {
            base = base + " — " + location;
        }
        if ("family".equals(personaKey)) {
            return "Góc nhìn gia đình: " + base;
        }
        if ("investor".equals(personaKey)) {
            return "Phân tích: " + base;
        }
        return base;
    }

    private static String buildLmktContentStructureGuide(String patternKey) {
        String key = String.valueOf(patternKey == null ? "" : patternKey).trim().toLowerCase(Locale.ROOT);
        return switch (key) {
            case "investment_analysis" -> """
                CẤU TRÚC PHÂN TÍCH ĐẦU TƯ: câu hỏi mở → dữ liệu/so sánh → rủi ro → kết luận khuyến nghị (h3/h4).""";
            case "family_story" -> """
                CẤU TRÚC CÂU CHUYỆN: nhân vật → nỗi đau → hành trình → quyết định → kết quả → lời khuyên.""";
            case "step_by_step_guide" -> """
                CẤU TRÚC HƯỚNG DẪN: vấn đề → bước 1-5 chi tiết → sai lầm cần tránh → FAQ ngắn.""";
            case "quick_tips" -> """
                CẤU TRÚC MẸO NHANH: hook → tip 1-3 (mỗi tip có lý do) → kết luận.""";
            case "landing_page" -> """
                CẤU TRÚC LANDING: headline → intro → lợi ích (ul) → tính năng → social proof → CTA nhẹ.""";
            default -> "Viết tự nhiên theo pattern đã chọn, heading h3/h4 rõ ràng.";
        };
    }

    private static String str(Object value, String defaultValue) {
        String s = String.valueOf(value == null ? "" : value).trim();
        return s.isBlank() ? defaultValue : s;
    }
}
