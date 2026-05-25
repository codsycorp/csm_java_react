package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Dynamic Retrieval Policy Engine: Score-based adaptive scope/topK per request.
 * 
 * Goal: Replace heuristic-only scope/topK with intelligent scoring that adapts to:
 * - Request-code match relevance
 * - Attachment mix and size
 * - Weak machine context budget
 * - Symbol density and type specificity
 * 
 * Output: RetrievalPolicy decision with scope mask and topK for Lucene retrieval.
 */
@Service
public class AiRetrievalPolicyEngine {

    public static class RetrievalPolicy {
        public String policyId;
        public int scopeMask;           // Bitmask: SCOPE_CODE | SCOPE_MENU | SCOPE_CONFIG | SCOPE_EXTERNAL
        public int topK;               // 5-50 range, adaptive
        public String scopeTags;       // Human-readable scope list (code, menu, config, external)
        public double relevanceScore;  // 0.0-1.0
        public double budgetFitScore;  // 0.0-1.0 (context budget utilization)
        public String rationale;       // Why this policy was chosen
        public Map<String, Object> metrics = new LinkedHashMap<>();

        @Override
        public String toString() {
            return String.format(
                "RetrievalPolicy{scopeTags=%s, topK=%d, relevance=%.2f, budget=%.2f, rationale=%s}",
                scopeTags, topK, relevanceScore, budgetFitScore, rationale
            );
        }
    }

    public static class RetriableScope {
        public int baseline;           // Default scope for context type
        public int adjusted;           // After policy scoring
        public List<String> included;  // Scope tags that matched
        public List<String> excluded;  // Scope tags that didn't match
    }

    // Scope bitmask constants — exactly matching AiMultimodalScannerService
    private static final int SCOPE_MENU = 1 << 0;      // 1 = AiMultimodalScannerService.SCOPE_MENU
    private static final int SCOPE_CODE = 1 << 1;      // 2 = AiMultimodalScannerService.SCOPE_CODE
    private static final int SCOPE_CONFIG = 1 << 2;    // 4 = AiMultimodalScannerService.SCOPE_UI_UX
    private static final int SCOPE_EXTERNAL = 1 << 3;  // 8 = AiMultimodalScannerService.SCOPE_JSON_SCHEMA

    private static final Pattern FUNCTION_PATTERN = Pattern.compile("\\b(?:function|def|class|public|private|interface)\\s+[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern SYMBOL_IMPORT_PATTERN = Pattern.compile("\\b(?:import|from|require|use)\\b");
    private static final Pattern TYPE_ANNOTATION_PATTERN = Pattern.compile("(?::\\s*[A-Z][A-Za-z0-9_<>]*|<[^>]+>|:\\s*type)");

    @Value("${ai.retrieval.policy.enabled:true}")
    private boolean enabled;

    @Value("${ai.retrieval.policy.adaptive-topk.enabled:true}")
    private boolean adaptiveTopKEnabled;

    @Value("${ai.retrieval.policy.adaptive-topk.min:5}")
    private int topKMin;

    @Value("${ai.retrieval.policy.adaptive-topk.max:50}")
    private int topKMax;

    @Value("${ai.retrieval.policy.adaptive-topk.base:12}")
    private int topKBase;

    @Value("${ai.retrieval.policy.relevance-threshold.narrow:0.7}")
    private double narrowRelevanceThreshold;

    @Value("${ai.retrieval.policy.relevance-threshold.broad:0.4}")
    private double broadRelevanceThreshold;

    @Value("${ai.retrieval.policy.weak-machine.enabled:true}")
    private boolean weakMachineOptimizationEnabled;

    @Value("${ai.retrieval.policy.weak-machine.topk-reduction-factor:0.75}")
    private double weakMachineTopKReductionFactor;

    @Value("${ai.retrieval.policy.weak-machine.memory-threshold-bytes:6000000000}")
    private long weakMachineMemoryThresholdBytes;

    @Value("${ai.retrieval.policy.symbol-density-threshold:0.15}")
    private double symbolDensityThreshold;

    @Value("${ai.retrieval.policy.attachment-relevance-boost:0.2}")
    private double attachmentRelevanceBoost;

    /**
     * Score-based policy decision: What scope and topK for this request?
     */
    public RetrievalPolicy decidePolicy(
        String message,
        String currentCode,
        int baselineScope,
        int attachmentCount,
        int codeChars,
        String language
    ) {
        if (!enabled) {
            RetrievalPolicy policy = new RetrievalPolicy();
            policy.policyId = "disabled";
            policy.scopeMask = baselineScope;
            policy.topK = topKBase;
            policy.rationale = "Policy engine disabled";
            return policy;
        }

        RetrievalPolicy policy = new RetrievalPolicy();
        policy.policyId = "orch-" + System.currentTimeMillis() % 100000;

        // ─── Score 1: Request-Code Relevance ───
        double requestCodeMatch = scoreRequestCodeMatch(message, currentCode, language);
        policy.metrics.put("requestCodeMatch", requestCodeMatch);

        // ─── Score 2: Symbol Density & Type Specificity ───
        double symbolDensity = scoreSymbolDensity(currentCode);
        boolean isTypeHeavy = isTypeHeavyLanguage(language) || scoreTypeAnnotations(currentCode) > 0.3;
        policy.metrics.put("symbolDensity", symbolDensity);
        policy.metrics.put("isTypeHeavy", isTypeHeavy);

        // ─── Score 3: Attachment Relevance Boost ───
        double attachmentBoost = attachmentCount > 0 ? attachmentRelevanceBoost : 0.0;
        policy.metrics.put("attachmentCount", attachmentCount);
        policy.metrics.put("attachmentBoost", attachmentBoost);

        // ─── Score 4: Context Budget & Weak Machine ───
        boolean isWeakMachine = isWeakMachine();
        double budgetUtilization = calculateBudgetUtilization(codeChars, isWeakMachine);
        policy.metrics.put("isWeakMachine", isWeakMachine);
        policy.metrics.put("budgetUtilization", budgetUtilization);

        // ─── Aggregate Relevance Score ───
        double baseRelevance = requestCodeMatch * 0.5 + symbolDensity * 0.25 + attachmentBoost * 0.25;
        double relevanceScore = baseRelevance;
        if (isTypeHeavy) {
            relevanceScore += 0.1; // Type-heavy code benefits from broader retrieval
        }
        if (isWeakMachine && budgetUtilization > 0.8) {
            relevanceScore -= 0.15; // Reduce relevance on memory pressure
        }
        relevanceScore = Math.min(1.0, Math.max(0.0, relevanceScore));
        policy.relevanceScore = relevanceScore;
        policy.budgetFitScore = budgetUtilization;

        // ─── Scope Decision ───
        RetriableScope scopeDecision = decideScopeMask(baselineScope, message, currentCode, relevanceScore, language);
        policy.scopeMask = scopeDecision.adjusted;
        policy.scopeTags = String.join(", ", scopeDecision.included);
        policy.metrics.put("scopeIncluded", scopeDecision.included);
        policy.metrics.put("scopeExcluded", scopeDecision.excluded);

        // ─── TopK Decision ───
        int adaptiveTopK = decideAdaptiveTopK(
            topKBase,
            relevanceScore,
            symbolDensity,
            budgetUtilization,
            isWeakMachine,
            codeChars
        );
        policy.topK = adaptiveTopK;
        policy.metrics.put("topKBase", topKBase);
        policy.metrics.put("topKAdaptive", adaptiveTopK);

        // ─── Rationale ───
        StringBuilder rationale = new StringBuilder();
        if (relevanceScore > 0.75) {
            rationale.append("High match (rel=").append(String.format("%.2f", relevanceScore)).append(") ");
        } else if (relevanceScore < 0.4) {
            rationale.append("Low match (rel=").append(String.format("%.2f", relevanceScore)).append(") ");
        } else {
            rationale.append("Medium match (rel=").append(String.format("%.2f", relevanceScore)).append(") ");
        }
        rationale.append("scopes=[").append(policy.scopeTags).append("] ");
        rationale.append("topK=").append(adaptiveTopK);
        if (isWeakMachine) {
            rationale.append(" (weak-machine-optimized)");
        }
        policy.rationale = rationale.toString();

        return policy;
    }

    /**
     * Score how well the request message aligns with current code.
     * Returns 0.0 (no match) to 1.0 (perfect match).
     */
    private double scoreRequestCodeMatch(String message, String currentCode, String language) {
        if (message == null || message.isBlank() || currentCode == null || currentCode.isBlank()) {
            return 0.0;
        }

        double score = 0.0;
        String lowerMsg = message.toLowerCase(Locale.ROOT);
        String lowerCode = currentCode.toLowerCase(Locale.ROOT);

        // Extract keywords from message
        String[] msgTokens = lowerMsg.split("[\\W_]+");

        // Count keyword matches in code
        int matches = 0;
        int totalTokens = msgTokens.length;
        for (String token : msgTokens) {
            if (token.length() >= 3 && lowerCode.contains(token)) {
                matches++;
            }
        }

        // Calculate match ratio
        double matchRatio = totalTokens > 0 ? (double) matches / totalTokens : 0.0;
        score += matchRatio * 0.4; // Up to 0.4 for token match

        // Bonus for intent keywords
        if (lowerMsg.contains("function") || lowerMsg.contains("class") || lowerMsg.contains("interface") ||
            lowerMsg.contains("method") || lowerMsg.contains("refactor") || lowerMsg.contains("optimize")) {
            score += 0.2;
        }

        // Bonus for specific code patterns
        if (lowerMsg.contains("error") || lowerMsg.contains("bug") || lowerMsg.contains("fix")) {
            score += 0.15;
        }

        return Math.min(1.0, score);
    }

    /**
     * Score code symbol density (function/class definitions).
     * High density = well-structured code that benefits from symbol-aware retrieval.
     */
    private double scoreSymbolDensity(String currentCode) {
        if (currentCode == null || currentCode.isBlank()) {
            return 0.0;
        }

        int codeLines = currentCode.split("\n").length;
        if (codeLines < 10) {
            return 0.1; // Too small to assess
        }

        long symbolCount = currentCode.lines()
            .filter(line -> FUNCTION_PATTERN.matcher(line).find() || line.matches(".*\\b(class|interface|def|function)\\b.*"))
            .count();

        double density = (double) symbolCount / codeLines;
        return Math.min(1.0, density / symbolDensityThreshold); // 0.15 is target; >15 symbols per 100 lines = 1.0
    }

    /**
     * Score type annotations as a proxy for type-heavy languages (TypeScript, Java).
     */
    private double scoreTypeAnnotations(String currentCode) {
        if (currentCode == null || currentCode.isBlank()) {
            return 0.0;
        }

        long typeCount = currentCode.lines()
            .filter(line -> TYPE_ANNOTATION_PATTERN.matcher(line).find())
            .count();

        int codeLines = currentCode.split("\n").length;
        if (codeLines < 10) {
            return 0.0;
        }

        double typeRatio = (double) typeCount / codeLines;
        return Math.min(1.0, typeRatio);
    }

    /**
     * Check if language is naturally type-heavy.
     */
    private boolean isTypeHeavyLanguage(String language) {
        if (language == null) return false;
        String lower = language.toLowerCase(Locale.ROOT);
        return lower.contains("typescript") || lower.contains("java") || lower.contains("kotlin") || lower.contains("csharp");
    }

    /**
     * Estimate if running on weak machine (< 6GB RAM or high memory pressure).
     */
    private boolean isWeakMachine() {
        if (!weakMachineOptimizationEnabled) {
            return false;
        }
        Runtime runtime = Runtime.getRuntime();
        long maxMemory = runtime.maxMemory();
        return maxMemory < weakMachineMemoryThresholdBytes;
    }

    /**
     * Calculate budget utilization: how much of available context is current code + message?
     */
    private double calculateBudgetUtilization(int codeChars, boolean isWeakMachine) {
        long contextBudget = isWeakMachine ? 15000 : 22000; // Weak machine = smaller budget
        return Math.min(1.0, (double) codeChars / contextBudget);
    }

    /**
     * Decide scope mask based on relevance and language.
     */
    private RetriableScope decideScopeMask(
        int baselineScope,
        String message,
        String currentCode,
        double relevanceScore,
        String language
    ) {
        RetriableScope result = new RetriableScope();
        result.baseline = baselineScope;
        result.included = new ArrayList<>();
        result.excluded = new ArrayList<>();

        int adjusted = baselineScope;

        // Always include baseline scope
        if ((baselineScope & SCOPE_CODE) != 0) {
            result.included.add("code");
        }
        if ((baselineScope & SCOPE_MENU) != 0) {
            result.included.add("menu");
        }

        // Narrow scope if low relevance
        if (relevanceScore < narrowRelevanceThreshold) {
            adjusted = baselineScope & ~(SCOPE_EXTERNAL | SCOPE_CONFIG); // Remove low-priority scopes
            result.excluded.add("external");
            result.excluded.add("config");
        } else if (relevanceScore > broadRelevanceThreshold) {
            // Expand scope if high relevance
            adjusted = baselineScope | SCOPE_EXTERNAL; // Add external scope for cross-file search
            result.included.add("external");
        }

        // Language-specific expansions
        if (language != null) {
            String lower = language.toLowerCase(Locale.ROOT);
            if (lower.contains("typescript") || lower.contains("javascript")) {
                adjusted |= SCOPE_CONFIG; // JS/TS often have config files
                result.included.add("config");
            }
        }

        result.adjusted = adjusted;
        return result;
    }

    /**
     * Decide adaptive topK (5-50 range) based on multiple signals.
     */
    private int decideAdaptiveTopK(
        int baseTopK,
        double relevanceScore,
        double symbolDensity,
        double budgetUtilization,
        boolean isWeakMachine,
        int codeChars
    ) {
        if (!adaptiveTopKEnabled) {
            return baseTopK;
        }

        double topKMultiplier = 1.0;

        // Relevance signal: high relevance = lower topK (more focused), low relevance = higher topK (broader)
        if (relevanceScore > 0.75) {
            topKMultiplier *= 0.7; // Narrow retrieval
        } else if (relevanceScore < 0.4) {
            topKMultiplier *= 1.3; // Broader retrieval
        }

        // Symbol density signal: high density = higher topK (more context patterns)
        if (symbolDensity > 0.3) {
            topKMultiplier *= 1.2;
        }

        // Budget signal: if memory is tight, reduce topK
        if (budgetUtilization > 0.8) {
            topKMultiplier *= 0.8;
        }

        // Weak machine reduction
        if (isWeakMachine && weakMachineOptimizationEnabled) {
            topKMultiplier *= weakMachineTopKReductionFactor;
        }

        int adaptiveTopK = (int) Math.round(baseTopK * topKMultiplier);
        adaptiveTopK = Math.max(topKMin, Math.min(topKMax, adaptiveTopK));

        return adaptiveTopK;
    }

    /**
     * Public query builders for symbol-aware 3-phase retrieval.
     */
    public List<String> buildSymbolAwareQueries(List<String> codeSymbols, int maxQueries) {
        List<String> queries = new ArrayList<>();
        if (codeSymbols == null || codeSymbols.isEmpty()) {
            return queries;
        }

        for (int i = 0; i < Math.min(maxQueries, codeSymbols.size()); i++) {
            String symbol = codeSymbols.get(i);
            if (symbol != null && !symbol.isBlank()) {
                // Variant 1: Direct implementation search
                queries.add(symbol + " implementation logic");
                // Variant 2: Usage pattern search
                queries.add(symbol + " usage pattern");
            }
        }

        return queries.subList(0, Math.min(maxQueries, queries.size()));
    }
}
