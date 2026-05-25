package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Adaptive Retry Policy: Standardize failure modes + learn from history.
 * 
 * Goal: Chuẩn hóa tất cả failure reasons, assign retry budgets, và planner
 * tự điều chỉnh từ lịch sử (e.g., reduce scope if retrieval was overambitious).
 * 
 * Retry Reason Taxonomy:
 * - LOW_EVIDENCE_GATE: Step didn't pass evidence threshold (suggestion: increase topK)
 * - PATCH_VALIDATOR_REJECT: SEARCH/REPLACE didn't parse correctly (suggestion: simplify edits)
 * - DRYRUN_CONFLICT: Line numbers changed after previous edits (suggestion: replan from scratch)
 * - LOW_CONFIDENCE_ANALYZE: Analyzer confidence < threshold (suggestion: broader context)
 * - PARSE_FAILURE: JSON/structured output malformed (suggestion: reduce prompt size)
 * - TIMEOUT: Step exceeded time budget (suggestion: reduce topK/scope)
 * - SEMANTIC_MISMATCH: AI output doesn't match intent (suggestion: swap strategy)
 * - RETRIEVAL_EMPTY: Lucene returned no results (suggestion: broaden query)
 * - UPSTREAM_FAILURE: Previous step failed (suggestion: fallback chain)
 * - UNKNOWN: Unclassified failure
 */
@Service
public class AiAdaptiveRetryPolicy {

    public enum RetryReason {
        LOW_EVIDENCE_GATE("evidence_gate_fail", 2, 0.85),
        PATCH_VALIDATOR_REJECT("validator_reject", 1, 0.75),
        DRYRUN_CONFLICT("dryrun_conflict", 1, 0.65),
        LOW_CONFIDENCE_ANALYZE("analyze_low_confidence", 2, 0.70),
        PARSE_FAILURE("parse_failed", 2, 0.80),
        TIMEOUT("timeout_exceeded", 1, 0.60),
        SEMANTIC_MISMATCH("semantic_mismatch", 2, 0.75),
        RETRIEVAL_EMPTY("retrieval_empty", 2, 0.70),
        UPSTREAM_FAILURE("upstream_fail", 1, 0.50),
        UNKNOWN("unknown", 1, 0.50);

        final String code;
        final int retryBudget;       // Max retries allowed for this reason
        final double baseSuccessRate; // Historical baseline (0-1 scale)

        RetryReason(String code, int retryBudget, double baseSuccessRate) {
            this.code = code;
            this.retryBudget = retryBudget;
            this.baseSuccessRate = baseSuccessRate;
        }

        public static RetryReason fromCode(String code) {
            for (RetryReason reason : values()) {
                if (reason.code.equalsIgnoreCase(code)) {
                    return reason;
                }
            }
            return UNKNOWN;
        }
    }

    /**
     * Recovery strategy: How planner should adjust on retry.
     */
    public static class RecoveryStrategy {
        public String strategyId;           // e.g., "expand_scope", "reduce_topK", "swap_strategy"
        public String description;
        public Map<String, Object> adjustments = new LinkedHashMap<>(); // Planner knobs to adjust
        public double expectedSuccessBoost; // Expected improvement in success rate (0-1)
        public int priorityRank;            // 1=try first, 2=try second, etc.

        public RecoveryStrategy() {}

        public RecoveryStrategy(String strategyId, String description, double expectedBoost, int priorityRank) {
            this.strategyId = strategyId;
            this.description = description;
            this.expectedSuccessBoost = expectedBoost;
            this.priorityRank = priorityRank;
        }

        @Override
        public String toString() {
            return String.format("RecoveryStrategy{%s (boost=%.1f%%), priority=%d}", strategyId, expectedSuccessBoost * 100, priorityRank);
        }
    }

    /**
     * Retry decision: Retry or give up?
     */
    public static class RetryDecision {
        public String decisionId;
        public boolean shouldRetry;
        public RetryReason reason;
        public int retriesRemaining;
        public int retriesUsed;
        public RecoveryStrategy strategy;
        public String rationale;
        public Map<String, Object> metrics = new LinkedHashMap<>();

        @Override
        public String toString() {
            return String.format(
                "RetryDecision{%s, retry=%s, retriesRemaining=%d, strategy=%s}",
                decisionId, shouldRetry, retriesRemaining, strategy == null ? "none" : strategy.strategyId
            );
        }
    }

    @Value("${ai.retry.policy.enabled:true}")
    private boolean enabled;

    @Value("${ai.retry.policy.global-max-retries:4}")
    private int globalMaxRetries;

    @Value("${ai.retry.policy.backoff-multiplier:1.5}")
    private double backoffMultiplier;

    @Value("${ai.retry.policy.history-window-minutes:60}")
    private int historyWindowMinutes;

    @Value("${ai.retry.policy.min-history-samples-for-adaptation:10}")
    private int minHistorySamplesForAdaptation;

    @Value("${ai.retry.policy.scope-reduction-factor:0.8}")
    private double scopeReductionFactor;

    @Value("${ai.retry.policy.topk-reduction-factor:0.75}")
    private double topKReductionFactor;

    @Value("${ai.retry.policy.topk-increase-factor:1.2}")
    private double topKInceaseFactor;

    // Per-request retry tracking (appId -> reason -> count)
    private final Map<String, Map<String, Integer>> retryCounters = new ConcurrentHashMap<>();

    // Per-reason success rate tracking (reason -> rolling average 0-1)
    private final Map<RetryReason, RollingSuccessRate> successRateHistory = new ConcurrentHashMap<>();

    public AiAdaptiveRetryPolicy() {
        for (RetryReason reason : RetryReason.values()) {
            successRateHistory.put(reason, new RollingSuccessRate(reason.baseSuccessRate));
        }
    }

    /**
     * Decide: Should we retry or give up?
     */
    public RetryDecision decideRetry(
        String appId,
        String requestId,
        RetryReason reason,
        int currentStep,
        int totalSteps,
        long elapsedMs
    ) {
        if (!enabled) {
            RetryDecision decision = new RetryDecision();
            decision.decisionId = requestId + "-" + currentStep;
            decision.shouldRetry = false;
            decision.reason = reason;
            decision.rationale = "Policy disabled";
            return decision;
        }

        RetryDecision decision = new RetryDecision();
        decision.decisionId = requestId + "-" + currentStep;
        decision.reason = reason;

        // Track retry count per request/reason
        Map<String, Integer> reqRetries = retryCounters.computeIfAbsent(appId, k -> new ConcurrentHashMap<>());
        int retriesUsed = reqRetries.getOrDefault(reason.code, 0);
        decision.retriesUsed = retriesUsed;

        // Check if we've exceeded retry budget
        if (retriesUsed >= reason.retryBudget) {
            decision.shouldRetry = false;
            decision.retriesRemaining = 0;
            decision.rationale = String.format("Retry budget exhausted for %s (%d/%d used)", reason.code, retriesUsed, reason.retryBudget);
            recordRetryDecision(appId, reason, false);
            return decision;
        }

        // Check global retry budget
        int totalRetries = reqRetries.values().stream().mapToInt(Integer::intValue).sum();
        if (totalRetries >= globalMaxRetries) {
            decision.shouldRetry = false;
            decision.retriesRemaining = 0;
            decision.rationale = String.format("Global retry budget exhausted (%d/%d retries used)", totalRetries, globalMaxRetries);
            recordRetryDecision(appId, reason, false);
            return decision;
        }

        // Check if we're making progress (at least some steps are succeeding)
        if (currentStep < totalSteps && totalRetries > 1) {
            double progressRate = (double) currentStep / totalSteps;
            if (progressRate < 0.2 && totalRetries > 2) {
                decision.shouldRetry = false;
                decision.retriesRemaining = 0;
                decision.rationale = String.format("Low progress rate (%.0f%% steps complete) after 2+ retries", progressRate * 100);
                recordRetryDecision(appId, reason, false);
                return decision;
            }
        }

        // Decide retry based on historical success rate
        RollingSuccessRate rateInfo = successRateHistory.get(reason);
        double successRate = rateInfo != null ? rateInfo.getCurrentRate() : reason.baseSuccessRate;
        double retryLikelihood = calculateRetryLikelihood(successRate, retriesUsed, reason.retryBudget);

        boolean shouldRetry = retryLikelihood > 0.5;
        decision.shouldRetry = shouldRetry;
        decision.retriesRemaining = shouldRetry ? (reason.retryBudget - retriesUsed - 1) : 0;

        if (shouldRetry) {
            // Determine recovery strategy
            decision.strategy = selectRecoveryStrategy(reason, retriesUsed, successRate);
            decision.rationale = String.format(
                "Retry %d/%d for %s (successRate=%.1f%%, strategy=%s)",
                retriesUsed + 1, reason.retryBudget, reason.code, successRate * 100,
                decision.strategy.strategyId
            );
            reqRetries.put(reason.code, retriesUsed + 1);
            recordRetryDecision(appId, reason, true);
        } else {
            decision.rationale = String.format("Give up on %s (successRate=%.1f%% too low)", reason.code, successRate * 100);
            recordRetryDecision(appId, reason, false);
        }

        return decision;
    }

    /**
     * Record success/failure for reason to update rolling average.
     */
    public void recordRetryOutcome(RetryReason reason, boolean succeeded) {
        if (!enabled) return;
        RollingSuccessRate rateInfo = successRateHistory.get(reason);
        if (rateInfo != null) {
            rateInfo.recordOutcome(succeeded);
        }
    }

    /**
     * Get current historical success rate for a reason (0-1 scale).
     */
    public double getHistoricalSuccessRate(RetryReason reason) {
        RollingSuccessRate rateInfo = successRateHistory.get(reason);
        return rateInfo != null ? rateInfo.getCurrentRate() : reason.baseSuccessRate;
    }

    /**
     * Select recovery strategy: Adjust planner knobs based on reason + history.
     */
    private RecoveryStrategy selectRecoveryStrategy(
        RetryReason reason,
        int retriesUsed,
        double historicalSuccessRate
    ) {
        switch (reason) {
            case LOW_EVIDENCE_GATE:
                // Insufficient evidence: increase retrieval scope/topK
                RecoveryStrategy expScope = new RecoveryStrategy("expand_scope", "Increase retrieval topK and scope mask", 0.25, 1);
                expScope.adjustments.put("topKMultiplier", topKInceaseFactor);
                expScope.adjustments.put("scopeExpand", true);
                return expScope;

            case PATCH_VALIDATOR_REJECT:
                // Edit validation failed: simplify edits or reduce change density
                RecoveryStrategy simplify = new RecoveryStrategy("simplify_edits", "Reduce edit density and simplify changes", 0.30, 1);
                simplify.adjustments.put("maxEditsPerStep", 1);
                simplify.adjustments.put("maxLinesPerEdit", 10);
                return simplify;

            case LOW_CONFIDENCE_ANALYZE:
                // Analyzer confidence too low: broader context
                RecoveryStrategy broaden = new RecoveryStrategy("broaden_context", "Expand retrieval scope for better context", 0.25, 1);
                broaden.adjustments.put("scopeExpand", true);
                broaden.adjustments.put("topKMultiplier", topKInceaseFactor);
                return broaden;

            case RETRIEVAL_EMPTY:
                // No retrieval results: broaden query or use fallback
                RecoveryStrategy broadenQuery = new RecoveryStrategy("broaden_query", "Use fallback query with fewer constraints", 0.20, 1);
                broadenQuery.adjustments.put("queryFallback", true);
                broadenQuery.adjustments.put("topKMultiplier", topKInceaseFactor);
                return broadenQuery;

            case PARSE_FAILURE:
                // JSON/structured output parse failed: reduce prompt size
                RecoveryStrategy reducPrompt = new RecoveryStrategy("reduce_prompt", "Reduce context size to improve parsing", 0.20, 1);
                reducPrompt.adjustments.put("maxPromptChars", 0.7); // 70% of original
                reducPrompt.adjustments.put("maxContextItems", 0.75);
                return reducPrompt;

            case DRYRUN_CONFLICT:
                // Line numbers changed: fall back to whole-file replacement
                RecoveryStrategy fallback = new RecoveryStrategy("fallback_strategy", "Use whole-file replace instead of incremental edits", 0.35, 1);
                fallback.adjustments.put("useIncrementalEdits", false);
                return fallback;

            case TIMEOUT:
                // Exceeded time budget: reduce scope/topK
                RecoveryStrategy reduceScope = new RecoveryStrategy("reduce_scope", "Reduce retrieval scope and topK for speed", 0.15, 1);
                reduceScope.adjustments.put("topKMultiplier", topKReductionFactor);
                reduceScope.adjustments.put("scopeReduce", true);
                return reduceScope;

            case SEMANTIC_MISMATCH:
                // Output doesn't match intent: try different approach
                RecoveryStrategy swapStrategy = new RecoveryStrategy("swap_strategy", "Switch to alternative execution strategy", 0.40, 1);
                swapStrategy.adjustments.put("strategySwitch", true);
                return swapStrategy;

            case UPSTREAM_FAILURE:
                // Previous step failed: skip this step or use cached result
                RecoveryStrategy skipStep = new RecoveryStrategy("skip_step", "Skip this step and use cached/fallback result", 0.25, 1);
                skipStep.adjustments.put("useCachedResult", true);
                return skipStep;

            default:
                // Unknown: conservative strategy
                RecoveryStrategy generic = new RecoveryStrategy("conservative_retry", "Retry with conservative settings", 0.10, 1);
                generic.adjustments.put("topKMultiplier", 0.8);
                return generic;
        }
    }

    /**
     * Calculate likelihood of successful retry based on historical rate.
     */
    private double calculateRetryLikelihood(double historicalSuccessRate, int retriesUsed, int budgetMax) {
        // If historical success rate is low, don't waste retries
        if (historicalSuccessRate < 0.4) {
            return 0.2; // Give it 20% chance
        }

        // Linear degradation: first retry is more likely than later retries
        double budgetFactor = (double) (budgetMax - retriesUsed) / budgetMax;
        double likelihood = historicalSuccessRate * (0.7 + 0.3 * budgetFactor);

        return Math.min(1.0, Math.max(0.1, likelihood));
    }

    /**
     * Record retry decision for metrics.
     */
    private void recordRetryDecision(String appId, RetryReason reason, boolean willRetry) {
        // Quality metrics dashboard removed.
    }

    /**
     * Clean up retry counters for completed requests.
     */
    public void cleanupRetryCounter(String appId) {
        retryCounters.remove(appId);
    }

    /**
     * Get current retry state for a request.
     */
    public Map<String, Object> getRetryState(String appId) {
        Map<String, Object> state = new LinkedHashMap<>();
        Map<String, Integer> counts = retryCounters.getOrDefault(appId, new HashMap<>());
        state.put("totalRetries", counts.values().stream().mapToInt(Integer::intValue).sum());
        state.put("retriesByReason", new HashMap<>(counts));
        state.put("successRates", new LinkedHashMap<String, Double>() {{
            for (RetryReason reason : RetryReason.values()) {
                RollingSuccessRate rate = successRateHistory.get(reason);
                if (rate != null) {
                    put(reason.code, rate.getCurrentRate());
                }
            }
        }});
        return state;
    }

    /**
     * Rolling average for success rate tracking (per-reason).
     */
    private static class RollingSuccessRate {
        private final List<Boolean> outcomes = new ArrayList<>();
        private final int maxSamples = 100; // Keep last 100 outcomes
        private double baseline;

        RollingSuccessRate(double baseline) {
            this.baseline = baseline;
        }

        void recordOutcome(boolean succeeded) {
            outcomes.add(succeeded);
            if (outcomes.size() > maxSamples) {
                outcomes.remove(0);
            }
        }

        double getCurrentRate() {
            if (outcomes.isEmpty()) {
                return baseline;
            }
            long successes = outcomes.stream().filter(b -> b).count();
            double empiricalRate = (double) successes / outcomes.size();

            // Blend empirical rate with baseline (baseline weight = 20%)
            return baseline * 0.2 + empiricalRate * 0.8;
        }
    }

    /**
     * Public utility to parse reason from string.
     */
    public static RetryReason parseReason(String reasonCode) {
        return RetryReason.fromCode(reasonCode);
    }
}
