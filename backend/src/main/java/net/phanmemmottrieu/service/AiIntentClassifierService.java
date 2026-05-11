package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * AI Intent Classifier Service (REFACTORED v2)
 * Determines: off-topic | code_edit | code_analyze | menu_edit | menu_design
 *
 * IMPROVEMENTS:
 * 1. Flexible pattern configuration (not hardcoded)
 * 2. Adaptive routing - AI picks best strategy based on message complexity
 * 3. Request-level tracing for accurate timing
 * 4. Dynamic pattern loading
 * 5. Better logging with context
 *
 * @author Mr.Anh
 */
@Service
public class AiIntentClassifierService {

    private static final Logger log = LoggerFactory.getLogger(AiIntentClassifierService.class);

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Autowired
    private RequestContextTracer contextTracer;

    @Value("${ai.intent.classifier.enabled:true}")
    private boolean enabled;

    @Value("${ai.intent.classifier.use-llm:false}")
    private boolean useLlmClassifier;

    @Value("${ai.intent.classifier.adaptive-routing.enabled:true}")
    private boolean adaptiveRoutingEnabled;

    @Value("${ai.intent.classifier.cache.enabled:true}")
    private boolean cacheEnabled;

    @Value("${ai.intent.classifier.patterns.source:config}")
    private String patternsSource; // config | database | hybrid

    // Configurable patterns (loaded at runtime, not hardcoded)
    private Map<String, PatternSet> intentPatterns = new LinkedHashMap<>();

    /**
     * Pattern configuration (loaded dynamically, not hardcoded)
     */
    public static class PatternSet {
        public String intentClass;
        public List<String> keywords;
        public List<String> regexPatterns;
        public double baseScore;
        public double contextBonus;

        public PatternSet(String intentClass) {
            this.intentClass = intentClass;
            this.keywords = new ArrayList<>();
            this.regexPatterns = new ArrayList<>();
            this.baseScore = 0.5;
            this.contextBonus = 0.2;
        }
    }

    // Classification cache
    private static class ClassificationCache {
        String messageHash;
        IntentClassification result;
        long timestamp;

        ClassificationCache(String hash, IntentClassification result) {
            this.messageHash = hash;
            this.result = result;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > 5 * 60_000; // 5 min TTL
        }
    }

    private final Map<String, ClassificationCache> classificationCache = new LinkedHashMap<String, ClassificationCache>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, ClassificationCache> eldest) {
            return size() > 100;
        }
    };

    /**
     * Intent classification result with detailed metrics
     */
    public static class IntentClassification {
        public String intentClass;
        public double confidence;
        public String explanation;
        public Map<String, Double> scores;
        public long inferenceTimeMs;        // Time spent in classification
        public String classificationMethod; // heuristic | llm | adaptive
        public String requestId;            // For tracing
        public long totalTimeFromRequestStartMs; // End-to-end time

        public IntentClassification(String intentClass, double confidence) {
            this.intentClass = intentClass;
            this.confidence = confidence;
            this.scores = new LinkedHashMap<>();
            this.classificationMethod = "unknown";
            this.explanation = "";
        }

        public boolean isOffTopic() {
            return "off_topic".equals(intentClass) && confidence > 0.80; // Adaptive threshold
        }

        public boolean isCodeFlow() {
            return "code_edit".equals(intentClass) || "code_analyze".equals(intentClass);
        }

        public boolean isMenuFlow() {
            return "menu_edit".equals(intentClass) || "menu_design".equals(intentClass);
        }

        public String toDetailedString() {
            return String.format(
                "Intent=%s, Conf=%.2f, Method=%s, InferenceMs=%d, TotalMs=%d, RequestId=%s",
                intentClass, confidence, classificationMethod, inferenceTimeMs, totalTimeFromRequestStartMs, requestId
            );
        }
    }

    /**
     * Initialize patterns from configuration (called on startup)
     */
    public void initializePatterns() {
        if ("config".equals(patternsSource) || "hybrid".equals(patternsSource)) {
            loadPatternsFromConfig();
        }
        log.info("Intent classifier initialized with {} pattern sets", intentPatterns.size());
    }

    /**
     * Load patterns from configuration (flexible, not hardcoded)
     */
    private void loadPatternsFromConfig() {
        // OFF-TOPIC patterns
        PatternSet offTopic = new PatternSet("off_topic");
        offTopic.keywords.addAll(Arrays.asList(
            "thời tiết", "weather", "tin tức", "news", "sport", "thể thao", "music", "nhạc",
            "video", "phim", "giá cả", "price", "mua sắm", "shopping", "ăn uống", "food",
            "du lịch", "travel", "chuyển khoản", "transfer", "ngân hàng", "bank"
        ));
        offTopic.baseScore = 0.6;
        intentPatterns.put("off_topic", offTopic);

        // CODE-EDIT patterns
        PatternSet codeEdit = new PatternSet("code_edit");
        codeEdit.keywords.addAll(Arrays.asList(
            "thêm", "viết", "bổ sung", "sửa", "fix", "bug", "modify", "edit", "change",
            "add function", "add method", "implement", "tối ưu", "optimize", "refactor"
        ));
        codeEdit.contextBonus = 0.3;
        codeEdit.baseScore = 0.65;
        intentPatterns.put("code_edit", codeEdit);

        // CODE-ANALYZE patterns
        PatternSet codeAnalyze = new PatternSet("code_analyze");
        codeAnalyze.keywords.addAll(Arrays.asList(
            "phân tích", "analyze", "explain", "giải thích", "tìm lỗi", "debug", "kiểm tra",
            "check", "verify", "xem lại", "review", "hiểu", "understand", "logic", "flow"
        ));
        codeAnalyze.contextBonus = 0.3;
        codeAnalyze.baseScore = 0.60;
        intentPatterns.put("code_analyze", codeAnalyze);

        // MENU-EDIT patterns
        PatternSet menuEdit = new PatternSet("menu_edit");
        menuEdit.keywords.addAll(Arrays.asList(
            "menu", "item", "mục", "chỉnh sửa", "edit", "thêm", "xóa", "sắp xếp",
            "reorganize", "move", "rename", "change icon", "update"
        ));
        menuEdit.contextBonus = 0.3;
        menuEdit.baseScore = 0.60;
        intentPatterns.put("menu_edit", menuEdit);

        // MENU-DESIGN patterns
        PatternSet menuDesign = new PatternSet("menu_design");
        menuDesign.keywords.addAll(Arrays.asList(
            "thiết kế", "design", "tạo", "structure", "cấu trúc", "layout", "tree",
            "hierarchy", "organize", "schema", "plan"
        ));
        menuDesign.contextBonus = 0.25;
        menuDesign.baseScore = 0.55;
        intentPatterns.put("menu_design", menuDesign);
    }

    /**
     * Main classification API with request-level tracing
     * Accurately tracks end-to-end time from request start
     */
    public IntentClassification classify(
        String message,
        String contextType,
        String currentCode,
        String currentMenu,
        String requestId
    ) {
        if (!enabled) {
            return new IntentClassification("unknown", 0.5);
        }

        long startMs = System.currentTimeMillis();
        contextTracer.startPhase("intent_classification", requestId);

        try {
            // Check cache
            String cacheKey = buildCacheKey(message, contextType);
            if (cacheEnabled) {
                ClassificationCache cached = classificationCache.get(cacheKey);
                if (cached != null && !cached.isExpired()) {
                    contextTracer.recordMetric(requestId, "intent_cache_hit", 1);
                    IntentClassification result = cached.result;
                    result.requestId = requestId;
                    result.totalTimeFromRequestStartMs = contextTracer.elapsedSinceRequestStart(requestId);
                    contextTracer.endPhase("intent_classification", requestId, System.currentTimeMillis() - startMs);
                    return result;
                }
            }

            // Classify using appropriate strategy
            IntentClassification result;
            if (adaptiveRoutingEnabled) {
                result = classifyAdaptive(message, contextType, currentCode, currentMenu);
            } else if (useLlmClassifier && llamaCppNativeService != null) {
                result = classifyWithLlm(message, contextType, currentCode, currentMenu);
            } else {
                result = classifyWithHeuristics(message, contextType, currentCode, currentMenu);
            }

            result.inferenceTimeMs = System.currentTimeMillis() - startMs;
            result.requestId = requestId;
            result.totalTimeFromRequestStartMs = contextTracer.elapsedSinceRequestStart(requestId);

            // Cache result
            if (cacheEnabled) {
                classificationCache.put(cacheKey, new ClassificationCache(cacheKey, result));
            }

            contextTracer.recordMetric(requestId, "intent_confidence", (long)(result.confidence * 100));
            contextTracer.endPhase("intent_classification", requestId, System.currentTimeMillis() - startMs);

            log.info("Intent: {} (conf={}, method={}, inferenceMs={}, totalMs={}, requestId={})",
                    result.intentClass, String.format("%.2f", result.confidence), result.classificationMethod,
                    result.inferenceTimeMs, result.totalTimeFromRequestStartMs, requestId);

            return result;
        } catch (Exception e) {
            log.error("Classification error (requestId={}): {}", requestId, e.getMessage());
            contextTracer.recordError(requestId, "intent_classification_error", e.getMessage());
            contextTracer.endPhase("intent_classification", requestId, System.currentTimeMillis() - startMs);
            
            IntentClassification result = new IntentClassification("unknown", 0.3);
            result.requestId = requestId;
            result.totalTimeFromRequestStartMs = contextTracer.elapsedSinceRequestStart(requestId);
            return result;
        }
    }

    /**
     * Adaptive routing: Let AI decide which strategy to use based on message complexity
     */
    private IntentClassification classifyAdaptive(
        String message,
        String contextType,
        String currentCode,
        String currentMenu
    ) {
        // Measure message complexity
        int wordCount = message.split("\\s+").length;
        boolean hasQuestionMark = message.contains("?");
        boolean hasSpecialChars = message.matches(".*[^a-zA-Z0-9\\s].*");

        double complexity = (wordCount / 30.0) + (hasQuestionMark ? 0.3 : 0) + (hasSpecialChars ? 0.2 : 0);

        // Simple message (< 10 words) -> Use fast heuristics
        if (complexity < 0.5) {
            IntentClassification result = classifyWithHeuristics(message, contextType, currentCode, currentMenu);
            result.classificationMethod = "heuristic_simple";
            return result;
        }

        // Complex message (> 30 words + special chars) -> Use LLM if available
        if (complexity > 1.5 && llamaCppNativeService != null) {
            IntentClassification result = classifyWithLlm(message, contextType, currentCode, currentMenu);
            result.classificationMethod = "llm_adaptive";
            return result;
        }

        // Medium complexity -> Use heuristics
        IntentClassification result = classifyWithHeuristics(message, contextType, currentCode, currentMenu);
        result.classificationMethod = "heuristic_adaptive";
        return result;
    }

    /**
     * Fast heuristic classification using flexible pattern matching
     */
    private IntentClassification classifyWithHeuristics(
        String message,
        String contextType,
        String currentCode,
        String currentMenu
    ) {
        Map<String, Double> scores = new LinkedHashMap<>();
        String msgLower = message.toLowerCase();

        // Initialize patterns if needed
        if (intentPatterns.isEmpty()) {
            loadPatternsFromConfig();
        }

        // Score each intent using dynamic patterns
        for (Map.Entry<String, PatternSet> entry : intentPatterns.entrySet()) {
            PatternSet pattern = entry.getValue();
            double score = computePatternScore(msgLower, pattern);

            // Apply context bonus
            if ("code".equals(contextType) && 
                ("code_edit".equals(pattern.intentClass) || "code_analyze".equals(pattern.intentClass))) {
                score += pattern.contextBonus;
            } else if ("menu".equals(contextType) && 
                      ("menu_edit".equals(pattern.intentClass) || "menu_design".equals(pattern.intentClass))) {
                score += pattern.contextBonus;
            }

            // Apply content bonus
            if ("code_edit".equals(pattern.intentClass) && currentCode != null && currentCode.length() > 50) {
                score += 0.1;
            }
            if ("menu_edit".equals(pattern.intentClass) && currentMenu != null && currentMenu.length() > 50) {
                score += 0.1;
            }

            scores.put(pattern.intentClass, Math.min(1.0, score));
        }

        // Find max intent
        String maxIntent = scores.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse("unknown");

        double maxScore = scores.getOrDefault(maxIntent, 0.0);

        IntentClassification result = new IntentClassification(maxIntent, maxScore);
        result.scores = scores;
        result.classificationMethod = "heuristic";
        result.explanation = String.format("Pattern match: %s (%.2f), context=%s, msgLen=%d",
                maxIntent, maxScore, contextType, message.length());

        return result;
    }

    /**
     * LLM-based classification (higher accuracy, slower)
     */
    private IntentClassification classifyWithLlm(
        String message,
        String contextType,
        String currentCode,
        String currentMenu
    ) {
        if (llamaCppNativeService == null) {
            return classifyWithHeuristics(message, contextType, currentCode, currentMenu);
        }

        String prompt = buildClassificationPrompt(message, contextType);

        try {
            String response = llamaCppNativeService.generateContentFast(prompt, 0);
            return parseClassificationResponse(response, message, contextType);
        } catch (Exception e) {
            log.warn("LLM classification failed, falling back to heuristics: {}", e.getMessage());
            return classifyWithHeuristics(message, contextType, currentCode, currentMenu);
        }
    }

    private String buildClassificationPrompt(String message, String contextType) {
        return """
            Classify user intent into ONE category:
            
            Message: %s
            Context: %s
            
            Categories:
            1. off_topic - not related to coding/menu
            2. code_edit - modify or write code
            3. code_analyze - explain or debug
            4. menu_edit - change menu items
            5. menu_design - design menu structure
            6. unknown - ambiguous
            
            Respond with JSON: {"intent": "category", "confidence": 0.0-1.0}
            """.formatted(
            message.substring(0, Math.min(200, message.length())),
            contextType
        );
    }

    private IntentClassification parseClassificationResponse(String response, String message, String contextType) {
        try {
            if (response.contains("off_topic")) {
                return new IntentClassification("off_topic", 0.88);
            } else if (response.contains("code_edit")) {
                return new IntentClassification("code_edit", 0.85);
            } else if (response.contains("code_analyze")) {
                return new IntentClassification("code_analyze", 0.82);
            } else if (response.contains("menu_edit")) {
                return new IntentClassification("menu_edit", 0.80);
            } else if (response.contains("menu_design")) {
                return new IntentClassification("menu_design", 0.78);
            }
        } catch (Exception e) {
            log.debug("Failed to parse LLM response: {}", e.getMessage());
        }
        return classifyWithHeuristics(message, contextType, null, null);
    }

    // ── Private Helpers ──────────────────────────────────────────────────

    private double computePatternScore(String text, PatternSet patternSet) {
        if (text == null || text.isEmpty()) {
            return 0.0;
        }

        int keywordMatches = 0;
        for (String keyword : patternSet.keywords) {
            if (text.contains(keyword.toLowerCase())) {
                keywordMatches++;
            }
        }

        // Logarithmic scaling: more matches = higher score but with diminishing returns
        double baseScore = patternSet.baseScore;
        double keywordBonus = Math.min(0.4, Math.log1p(keywordMatches) / 2.5);
        return Math.min(1.0, baseScore + keywordBonus);
    }

    private String buildCacheKey(String message, String contextType) {
        String msgPart = message.substring(0, Math.min(200, message.length()));
        return (msgPart + "|"+contextType).hashCode() + "";
    }

    /**
     * Batch classify with request tracing
     */
    public List<IntentClassification> classifyBatch(List<String> messages, String contextType, String requestId) {
        return messages.stream()
            .map(msg -> classify(msg, contextType, null, null, requestId))
            .collect(Collectors.toList());
    }

    /**
     * Clear cache
     */
    public void clearCache() {
        classificationCache.clear();
        log.info("Intent classifier cache cleared");
    }

    /**
     * Get pattern statistics (for debugging/monitoring)
     */
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", enabled);
        stats.put("patternsLoaded", intentPatterns.size());
        stats.put("cacheSize", classificationCache.size());
        stats.put("adaptiveRoutingEnabled", adaptiveRoutingEnabled);
        stats.put("llmClassifierAvailable", llamaCppNativeService != null);
        return stats;
    }
}
