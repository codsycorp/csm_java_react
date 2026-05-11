package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * API Call Instrumentation Service
 * Tracking chi phí API calls để đảm bảo tối ưu chi phí Gemini 2.5 Pro
 */
@Service
public class ApiCallInstrumentationService {

    private static final DateTimeFormatter HOUR_BUCKET_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:00").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter DAY_BUCKET_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    public static class ApiCallMetric {
        public String callId;
        public long timestamp;
        public String apiName; // "gemini-2.5-pro", "local-translate", etc.
        public String taskType; // "menu_design", "menu_language_fill", etc.
        public int inputTokens;
        public int outputTokens;
        public double estimatedCostVND; // Ước tính chi phí VND
        public long durationMs;
        public boolean success;
        public String reason; // "template_match", "cache_hit", "full_api_call", etc.

        public ApiCallMetric(String callId, String apiName, String taskType) {
            this.callId = callId;
            this.apiName = apiName;
            this.taskType = taskType;
            this.timestamp = System.currentTimeMillis();
        }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("callId", callId);
            m.put("apiName", apiName);
            m.put("taskType", taskType);
            m.put("timestamp", timestamp);
            m.put("inputTokens", inputTokens);
            m.put("outputTokens", outputTokens);
            m.put("estimatedCostVND", estimatedCostVND);
            m.put("durationMs", durationMs);
            m.put("success", success);
            m.put("reason", reason);
            return m;
        }
    }

    public static class AiTelemetryMetric {
        public String telemetryId;
        public long timestamp;
        public String flow; // ai-code-stream | ai-assistant-chat
        public String appId;
        public String contextType;
        public String taskType;
        public String responseMode;
        public String model;
        public int inputTokens;
        public int outputTokens;
        public int promptTokens;
        public int completionTokens;
        public int inputChars;
        public int outputChars;
        public int promptChars;
        public double estimatedCostUsd;
        public boolean switchedToDefaultModel;
        public boolean providerFallbackUsed;
        public boolean usedGeminiFallback;
        public boolean usedQuickProbe;
        public boolean skippedQuickProbe;
        public boolean usedDirectProviderRoute;
        public int attachments;
        public int elapsedMs;
        public String routingTier;
        public String preferredModelHint;
        public boolean speculativeExecuted;
        public String speculativeOperation;
        public String outputShape;
        public int textEditsCount;
        public boolean fallbackToFullCode;
        public boolean textEditsRetryTriggered;
        public int textEditsRetryAttempts;
        public int attemptsUsed;
        public int maxAttempts;
        public int providerCallsEstimate;
        public boolean inputBudgetGuardTriggered;
        public int estimatedSavedTokens;
        public boolean localPreAnalysisAttempted;
        public boolean localPreAnalysisHandled;
        public boolean localPreAnalysisCloudContextInjected;
        public String localPreAnalysisReasonCode;
        public boolean focusedContextApplied;
        public int focusedContextLuceneTopKCount;
        public int focusedContextKeywordHits;
        public boolean focusedContextCursorWindowIncluded;
        public boolean analyzeSlidingWindowApplied;
        public int analyzeSlidingWindowCount;
        public int analyzeSlidingWindowCharsUsed;
        public boolean analyzeSlidingWindowCpuCapped;
        public int analyzeSlidingWindowMaxWindowsEffective;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("telemetryId", telemetryId);
            m.put("timestamp", timestamp);
            m.put("flow", flow);
            m.put("appId", appId);
            m.put("contextType", contextType);
            m.put("taskType", taskType);
            m.put("responseMode", responseMode);
            m.put("model", model);
            m.put("inputTokens", inputTokens);
            m.put("outputTokens", outputTokens);
            m.put("promptTokens", promptTokens);
            m.put("completionTokens", completionTokens);
            m.put("inputChars", inputChars);
            m.put("outputChars", outputChars);
            m.put("promptChars", promptChars);
            m.put("estimatedCostUsd", estimatedCostUsd);
            m.put("switchedToDefaultModel", switchedToDefaultModel);
            m.put("providerFallbackUsed", providerFallbackUsed);
            m.put("usedGeminiFallback", usedGeminiFallback);
            m.put("usedQuickProbe", usedQuickProbe);
            m.put("skippedQuickProbe", skippedQuickProbe);
            m.put("usedDirectProviderRoute", usedDirectProviderRoute);
            m.put("attachments", attachments);
            m.put("elapsedMs", elapsedMs);
            m.put("routingTier", routingTier);
            m.put("preferredModelHint", preferredModelHint);
            m.put("speculativeExecuted", speculativeExecuted);
            m.put("speculativeOperation", speculativeOperation);
            m.put("outputShape", outputShape);
            m.put("textEditsCount", textEditsCount);
            m.put("fallbackToFullCode", fallbackToFullCode);
            m.put("textEditsRetryTriggered", textEditsRetryTriggered);
            m.put("textEditsRetryAttempts", textEditsRetryAttempts);
            m.put("attemptsUsed", attemptsUsed);
            m.put("maxAttempts", maxAttempts);
            m.put("providerCallsEstimate", providerCallsEstimate);
            m.put("inputBudgetGuardTriggered", inputBudgetGuardTriggered);
            m.put("estimatedSavedTokens", estimatedSavedTokens);
            m.put("localPreAnalysisAttempted", localPreAnalysisAttempted);
            m.put("localPreAnalysisHandled", localPreAnalysisHandled);
            m.put("localPreAnalysisCloudContextInjected", localPreAnalysisCloudContextInjected);
            m.put("localPreAnalysisReasonCode", localPreAnalysisReasonCode);
            m.put("focusedContextApplied", focusedContextApplied);
            m.put("focusedContextLuceneTopKCount", focusedContextLuceneTopKCount);
            m.put("focusedContextKeywordHits", focusedContextKeywordHits);
            m.put("focusedContextCursorWindowIncluded", focusedContextCursorWindowIncluded);
            m.put("analyzeSlidingWindowApplied", analyzeSlidingWindowApplied);
            m.put("analyzeSlidingWindowCount", analyzeSlidingWindowCount);
            m.put("analyzeSlidingWindowCharsUsed", analyzeSlidingWindowCharsUsed);
            m.put("analyzeSlidingWindowCpuCapped", analyzeSlidingWindowCpuCapped);
            m.put("analyzeSlidingWindowMaxWindowsEffective", analyzeSlidingWindowMaxWindowsEffective);
            return m;
        }
    }

    private final List<ApiCallMetric> callHistory = Collections.synchronizedList(new ArrayList<>());
    private final List<AiTelemetryMetric> aiTelemetryHistory = Collections.synchronizedList(new ArrayList<>());
    private final AtomicLong totalApiCallCount = new AtomicLong(0);
    private final AtomicLong totalLocalProcessCount = new AtomicLong(0);
    private final AtomicLong totalGeminiCostVND = new AtomicLong(0);

    // Gemini 2.5 Pro pricing (as of 2024):
    // Input: 75k tokens = 1 USD
    // Output: 300k tokens = 1 USD
    // Estimate 1 USD = 24,000 VND
    private static final double INPUT_COST_PER_1M_TOKENS = 1.0 / 75 * 24000; // VND per token
    private static final double OUTPUT_COST_PER_1M_TOKENS = 1.0 / 300 * 24000; // VND per token

    public ApiCallMetric recordLocalTranslation(String taskType, int itemsProcessed, long durationMs) {
        ApiCallMetric metric = new ApiCallMetric(
            generateCallId(),
            "local-translate",
            taskType
        );
        metric.inputTokens = 0; // Local processing không dùng API tokens
        metric.outputTokens = 0;
        metric.estimatedCostVND = 0;
        metric.durationMs = durationMs;
        metric.success = true;
        metric.reason = "local_heuristic_applied";

        callHistory.add(metric);
        totalLocalProcessCount.incrementAndGet();
        return metric;
    }

    public ApiCallMetric recordCacheHit(String taskType, int itemsFromCache) {
        ApiCallMetric metric = new ApiCallMetric(
            generateCallId(),
            "cache-lookup",
            taskType
        );
        metric.inputTokens = 0;
        metric.outputTokens = 0;
        metric.estimatedCostVND = 0;
        metric.durationMs = 5; // Cache lookup ~5ms
        metric.success = true;
        metric.reason = "cache_hit_" + itemsFromCache + "_items";

        callHistory.add(metric);
        return metric;
    }

    public ApiCallMetric recordGeminiCall(
            String taskType,
            int inputTokens,
            int outputTokens,
            long durationMs,
            boolean success,
            String reason) {
        ApiCallMetric metric = new ApiCallMetric(
            generateCallId(),
            "gemini-2.5-pro",
            taskType
        );
        metric.inputTokens = inputTokens;
        metric.outputTokens = outputTokens;
        metric.estimatedCostVND = calculateEstimatedCost(inputTokens, outputTokens);
        metric.durationMs = durationMs;
        metric.success = success;
        metric.reason = reason;

        callHistory.add(metric);
        totalApiCallCount.incrementAndGet();
        totalGeminiCostVND.addAndGet((long) metric.estimatedCostVND);
        return metric;
    }

    public Map<String, Object> getMetrics() {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("totalApiCalls", totalApiCallCount.get());
        metrics.put("totalLocalProcesses", totalLocalProcessCount.get());
        metrics.put("totalGeminiCostVND", totalGeminiCostVND.get());
        metrics.put("costSavingsRatio", calculateCostSavingsRatio());
        metrics.put("recentCalls", callHistory.stream()
            .skip(Math.max(0, callHistory.size() - 20))
            .map(ApiCallMetric::toMap)
            .toList());
        return metrics;
    }

    public Map<String, Object> getMetricsBySummary() {
        Map<String, Object> summary = new LinkedHashMap<>();

        long totalCalls = totalApiCallCount.get() + totalLocalProcessCount.get();
        long geminiCalls = totalApiCallCount.get();
        long localCalls = totalLocalProcessCount.get();
        long totalCostVND = totalGeminiCostVND.get();

        summary.put("timestamp", System.currentTimeMillis());
        summary.put("totalApiInteractions", totalCalls);
        summary.put("geminiApiCalls", geminiCalls);
        summary.put("localProcesses", localCalls);
        summary.put("localProcessPercentage", totalCalls > 0 ? 
            String.format("%.1f%%", (double) localCalls / totalCalls * 100) : "0%");
        summary.put("totalCostVND", totalCostVND);
        summary.put("averageCostPerGeminiCall", geminiCalls > 0 ? 
            totalCostVND / geminiCalls : 0);
        summary.put("estimatedMonthlyCost", totalCostVND * 30); // Rough estimate

        return summary;
    }

    public void recordAiTelemetry(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        AiTelemetryMetric metric = new AiTelemetryMetric();
        metric.telemetryId = "tel_" + UUID.randomUUID().toString().substring(0, 8) + "_" + System.currentTimeMillis();
        metric.timestamp = toLong(payload.get("timestamp"), System.currentTimeMillis());
        metric.flow = toText(payload.get("flow"));
        metric.appId = toText(payload.get("appId"));
        metric.contextType = toText(payload.get("contextType"));
        metric.taskType = toText(payload.get("taskType"));
        metric.responseMode = toText(payload.get("responseMode"));
        metric.model = toText(payload.get("model"));
        metric.inputTokens = toInt(payload.get("inputTokens"));
        metric.outputTokens = toInt(payload.get("outputTokens"));
        metric.promptTokens = toInt(payload.get("promptTokens"));
        metric.completionTokens = toInt(payload.get("completionTokens"));
        metric.inputChars = toInt(payload.get("inputChars"));
        metric.outputChars = toInt(payload.get("outputChars"));
        metric.promptChars = toInt(payload.get("promptChars"));
        metric.estimatedCostUsd = toDouble(payload.get("estimatedCostUsd"));
        metric.switchedToDefaultModel = toBool(payload.get("switchedToDefaultModel"));
        metric.providerFallbackUsed = toBool(payload.get("providerFallbackUsed"));
        metric.usedGeminiFallback = toBool(payload.get("usedGeminiFallback"));
        metric.usedQuickProbe = toBool(payload.get("usedQuickProbe"));
        metric.skippedQuickProbe = toBool(payload.get("skippedQuickProbe"));
        metric.usedDirectProviderRoute = toBool(payload.get("usedDirectProviderRoute"));
        metric.attachments = toInt(payload.get("attachments"));
        metric.elapsedMs = toInt(payload.get("elapsedMs"));
        metric.routingTier = toText(payload.get("routingTier"));
        metric.preferredModelHint = toText(payload.get("preferredModelHint"));
        metric.speculativeExecuted = toBool(payload.get("speculativeExecuted"));
        metric.speculativeOperation = toText(payload.get("speculativeOperation"));
        metric.outputShape = toText(payload.get("outputShape"));
        metric.textEditsCount = toInt(payload.get("textEditsCount"));
        metric.fallbackToFullCode = toBool(payload.get("fallbackToFullCode"));
        metric.textEditsRetryTriggered = toBool(payload.get("textEditsRetryTriggered"));
        metric.textEditsRetryAttempts = toInt(payload.get("textEditsRetryAttempts"));
        metric.attemptsUsed = toInt(payload.get("attemptsUsed"));
        metric.maxAttempts = toInt(payload.get("maxAttempts"));
        metric.providerCallsEstimate = toInt(payload.get("providerCallsEstimate"));
        metric.inputBudgetGuardTriggered = toBool(payload.get("inputBudgetGuardTriggered"));
        metric.estimatedSavedTokens = toInt(payload.get("estimatedSavedTokens"));
        metric.localPreAnalysisAttempted = toBool(payload.get("localPreAnalysisAttempted"));
        metric.localPreAnalysisHandled = toBool(payload.get("localPreAnalysisHandled"));
        metric.localPreAnalysisCloudContextInjected = toBool(payload.get("localPreAnalysisCloudContextInjected"));
        metric.localPreAnalysisReasonCode = toText(payload.get("localPreAnalysisReasonCode"));
        metric.focusedContextApplied = toBool(payload.get("focusedContextApplied"));
        metric.focusedContextLuceneTopKCount = toInt(payload.get("focusedContextLuceneTopKCount"));
        metric.focusedContextKeywordHits = toInt(payload.get("focusedContextKeywordHits"));
        metric.focusedContextCursorWindowIncluded = toBool(payload.get("focusedContextCursorWindowIncluded"));
        metric.analyzeSlidingWindowApplied = toBool(payload.get("analyzeSlidingWindowApplied"));
        metric.analyzeSlidingWindowCount = toInt(payload.get("analyzeSlidingWindowCount"));
        metric.analyzeSlidingWindowCharsUsed = toInt(payload.get("analyzeSlidingWindowCharsUsed"));
        metric.analyzeSlidingWindowCpuCapped = toBool(payload.get("analyzeSlidingWindowCpuCapped"));
        metric.analyzeSlidingWindowMaxWindowsEffective = toInt(payload.get("analyzeSlidingWindowMaxWindowsEffective"));

        aiTelemetryHistory.add(metric);
        pruneAiTelemetryHistoryIfNeeded(5000);
    }

    public Map<String, Object> getAiTelemetryDashboard(
            int windowHours,
            double fallbackAlertThreshold,
            double quickProbeAlertThreshold,
            int minSamplesForAlert) {
        long now = System.currentTimeMillis();
        int safeWindowHours = Math.max(1, Math.min(24 * 30, windowHours));
        long windowStart = now - safeWindowHours * 3600_000L;
        int safeMinSamples = Math.max(5, minSamplesForAlert);

        List<AiTelemetryMetric> snapshot;
        synchronized (aiTelemetryHistory) {
            snapshot = new ArrayList<>(aiTelemetryHistory);
        }

        List<AiTelemetryMetric> windowEvents = new ArrayList<>();
        for (AiTelemetryMetric metric : snapshot) {
            if (metric != null && metric.timestamp >= windowStart) {
                windowEvents.add(metric);
            }
        }

        Map<String, Object> summary = buildTelemetrySummary(windowEvents);
        Map<String, Object> hourly = buildHourlyBuckets(windowEvents);
        Map<String, Object> daily = buildDailyBuckets(snapshot, 7);
        Map<String, Object> alerts = buildTelemetryAlerts(
            windowEvents,
            fallbackAlertThreshold,
            quickProbeAlertThreshold,
            safeMinSamples);
        Map<String, Object> recommendations = buildAdaptiveBudgetRecommendations(alerts, summary);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("windowHours", safeWindowHours);
        out.put("windowStart", windowStart);
        out.put("windowEnd", now);
        out.put("summary", summary);
        out.put("hourly", hourly);
        out.put("daily", daily);
        out.put("alerts", alerts);
        out.put("adaptiveBudgetRecommendations", recommendations);
        out.put("recentTelemetry", windowEvents.stream()
            .skip(Math.max(0, windowEvents.size() - 40))
            .map(AiTelemetryMetric::toMap)
            .toList());
        return out;
    }

    private Map<String, Object> buildTelemetrySummary(List<AiTelemetryMetric> events) {
        int total = events == null ? 0 : events.size();
        int fallbackCount = 0;
        int quickProbeCount = 0;
        int skipQuickProbeCount = 0;
        int directProviderCount = 0;
        int inputBudgetGuardCount = 0;
        int codeStreamEvents = 0;
        int codeStreamEditEvents = 0;
        int textEditsLineCount = 0;
        int fullCodeFallbackCount = 0;
        int textEditsRetryTriggeredCount = 0;
        int textEditsRetrySuccessCount = 0;
        long textEditsTotal = 0;
        long textEditsRetryAttemptsTotal = 0;
        long attemptsUsedTotal = 0;
        long providerCallsEstimateTotal = 0;
        long estimatedSavedTokensTotal = 0;
        int localPreAnalysisAttemptedCount = 0;
        int localPreAnalysisHandledCount = 0;
        int localPreAnalysisCloudContextInjectedCount = 0;
        int focusedContextAppliedCount = 0;
        int focusedContextCursorWindowIncludedCount = 0;
        long focusedContextLuceneTopKTotal = 0;
        long focusedContextKeywordHitsTotal = 0;
        int analyzeSlidingWindowAppliedCount = 0;
        int analyzeSlidingWindowCpuCappedCount = 0;
        long analyzeSlidingWindowCountTotal = 0;
        long analyzeSlidingWindowCharsUsedTotal = 0;
        long analyzeSlidingWindowMaxWindowsEffectiveTotal = 0;
        long inputTokens = 0;
        long outputTokens = 0;
        long elapsedMs = 0;
        double totalCostUsd = 0.0;
        int speculativeCount = 0;
        Map<String, Integer> flowCounts = new LinkedHashMap<>();
        Map<String, Integer> routingTierCounts = new LinkedHashMap<>();
        Map<String, Integer> outputShapeCounts = new LinkedHashMap<>();
        Map<String, Integer> localPreAnalysisReasonCounts = new LinkedHashMap<>();

        if (events != null) {
            for (AiTelemetryMetric m : events) {
                if (m == null) continue;
                if (m.providerFallbackUsed || m.usedGeminiFallback || m.switchedToDefaultModel) {
                    fallbackCount++;
                }
                if (m.usedQuickProbe) quickProbeCount++;
                if (m.skippedQuickProbe) skipQuickProbeCount++;
                if (m.usedDirectProviderRoute) directProviderCount++;
                if (m.inputBudgetGuardTriggered || "input_budget_guard".equalsIgnoreCase(toText(m.taskType))) {
                    inputBudgetGuardCount++;
                }
                inputTokens += Math.max(0, m.inputTokens + m.promptTokens);
                outputTokens += Math.max(0, m.outputTokens + m.completionTokens);
                elapsedMs += Math.max(0, m.elapsedMs);
                totalCostUsd += Math.max(0.0, m.estimatedCostUsd);
                if (m.speculativeExecuted) {
                    speculativeCount++;
                }
                String flow = toText(m.flow);
                flowCounts.put(flow, flowCounts.getOrDefault(flow, 0) + 1);
                if ("ai-code-stream".equalsIgnoreCase(flow)) {
                    codeStreamEvents++;
                    if ("edit".equalsIgnoreCase(toText(m.responseMode))) {
                        codeStreamEditEvents++;
                    }
                }
                String routingTier = toText(m.routingTier);
                if (!routingTier.isBlank()) {
                    routingTierCounts.put(routingTier, routingTierCounts.getOrDefault(routingTier, 0) + 1);
                }
                String outputShape = toText(m.outputShape);
                if (!outputShape.isBlank()) {
                    outputShapeCounts.put(outputShape, outputShapeCounts.getOrDefault(outputShape, 0) + 1);
                }

                if ("text_edits_line".equalsIgnoreCase(outputShape)) {
                    textEditsLineCount++;
                }
                if (m.fallbackToFullCode || "full_code".equalsIgnoreCase(outputShape)) {
                    fullCodeFallbackCount++;
                }
                if (m.textEditsRetryTriggered) {
                    textEditsRetryTriggeredCount++;
                    if ("text_edits_line".equalsIgnoreCase(outputShape)) {
                        textEditsRetrySuccessCount++;
                    }
                }
                textEditsTotal += Math.max(0, m.textEditsCount);
                textEditsRetryAttemptsTotal += Math.max(0, m.textEditsRetryAttempts);
                attemptsUsedTotal += Math.max(0, m.attemptsUsed);
                providerCallsEstimateTotal += Math.max(0, m.providerCallsEstimate);
                estimatedSavedTokensTotal += Math.max(0, m.estimatedSavedTokens);

                if (m.localPreAnalysisAttempted) {
                    localPreAnalysisAttemptedCount++;
                }
                if (m.localPreAnalysisHandled) {
                    localPreAnalysisHandledCount++;
                }
                if (m.localPreAnalysisCloudContextInjected) {
                    localPreAnalysisCloudContextInjectedCount++;
                }
                String localReason = toText(m.localPreAnalysisReasonCode);
                if (!localReason.isBlank()) {
                    localPreAnalysisReasonCounts.put(localReason, localPreAnalysisReasonCounts.getOrDefault(localReason, 0) + 1);
                }

                if (m.focusedContextApplied) {
                    focusedContextAppliedCount++;
                }
                if (m.focusedContextCursorWindowIncluded) {
                    focusedContextCursorWindowIncludedCount++;
                }
                focusedContextLuceneTopKTotal += Math.max(0, m.focusedContextLuceneTopKCount);
                focusedContextKeywordHitsTotal += Math.max(0, m.focusedContextKeywordHits);

                if (m.analyzeSlidingWindowApplied) {
                    analyzeSlidingWindowAppliedCount++;
                }
                if (m.analyzeSlidingWindowCpuCapped) {
                    analyzeSlidingWindowCpuCappedCount++;
                }
                analyzeSlidingWindowCountTotal += Math.max(0, m.analyzeSlidingWindowCount);
                analyzeSlidingWindowCharsUsedTotal += Math.max(0, m.analyzeSlidingWindowCharsUsed);
                analyzeSlidingWindowMaxWindowsEffectiveTotal += Math.max(0, m.analyzeSlidingWindowMaxWindowsEffective);
            }
        }

        int textEditRateBase = Math.max(1, codeStreamEditEvents);
        int retryRateBase = Math.max(1, codeStreamEvents);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalEvents", total);
        out.put("fallbackCount", fallbackCount);
        out.put("fallbackRate", ratio(fallbackCount, total));
        out.put("quickProbeCount", quickProbeCount);
        out.put("quickProbeRate", ratio(quickProbeCount, total));
        out.put("skipQuickProbeCount", skipQuickProbeCount);
        out.put("directProviderRouteCount", directProviderCount);
        out.put("inputBudgetGuardCount", inputBudgetGuardCount);
        out.put("inputBudgetGuardRate", ratio(inputBudgetGuardCount, total));
        out.put("inputTokens", inputTokens);
        out.put("outputTokens", outputTokens);
        out.put("avgElapsedMs", total <= 0 ? 0 : (elapsedMs / total));
        out.put("estimatedCostUsd", round6(totalCostUsd));
        out.put("speculativeExecutionCount", speculativeCount);
        out.put("speculativeExecutionRate", ratio(speculativeCount, total));
        out.put("codeStreamEvents", codeStreamEvents);
        out.put("codeStreamEditEvents", codeStreamEditEvents);
        out.put("textEditsLineCount", textEditsLineCount);
        out.put("textEditsLineRate", round6((double) textEditsLineCount / textEditRateBase));
        out.put("fullCodeFallbackCount", fullCodeFallbackCount);
        out.put("fullCodeFallbackRate", round6((double) fullCodeFallbackCount / textEditRateBase));
        out.put("textEditsTotal", textEditsTotal);
        out.put("avgTextEditsPerEvent", round6((double) textEditsTotal / Math.max(1, codeStreamEvents)));
        out.put("textEditsRetryTriggeredCount", textEditsRetryTriggeredCount);
        out.put("textEditsRetryTriggeredRate", round6((double) textEditsRetryTriggeredCount / retryRateBase));
        out.put("textEditsRetrySuccessCount", textEditsRetrySuccessCount);
        out.put("textEditsRetrySuccessRate", round6((double) textEditsRetrySuccessCount / Math.max(1, textEditsRetryTriggeredCount)));
        out.put("textEditsRetryAttemptsTotal", textEditsRetryAttemptsTotal);
        out.put("attemptsUsedTotal", attemptsUsedTotal);
        out.put("avgAttemptsUsed", round6((double) attemptsUsedTotal / Math.max(1, codeStreamEvents)));
        out.put("providerCallsEstimateTotal", providerCallsEstimateTotal);
        out.put("avgProviderCallsEstimate", round6((double) providerCallsEstimateTotal / Math.max(1, codeStreamEvents)));
        out.put("estimatedSavedTokensTotal", estimatedSavedTokensTotal);
        out.put("avgEstimatedSavedTokensPerEvent", round6((double) estimatedSavedTokensTotal / Math.max(1, total)));
        out.put("localPreAnalysisAttemptedCount", localPreAnalysisAttemptedCount);
        out.put("localPreAnalysisAttemptedRate", ratio(localPreAnalysisAttemptedCount, total));
        out.put("localPreAnalysisHandledCount", localPreAnalysisHandledCount);
        out.put("localPreAnalysisHandledRate", ratio(localPreAnalysisHandledCount, total));
        out.put("localPreAnalysisCloudContextInjectedCount", localPreAnalysisCloudContextInjectedCount);
        out.put("localPreAnalysisCloudContextInjectedRate", ratio(localPreAnalysisCloudContextInjectedCount, total));
        out.put("focusedContextAppliedCount", focusedContextAppliedCount);
        out.put("focusedContextAppliedRate", ratio(focusedContextAppliedCount, total));
        out.put("focusedContextCursorWindowIncludedCount", focusedContextCursorWindowIncludedCount);
        out.put("focusedContextCursorWindowIncludedRate", ratio(focusedContextCursorWindowIncludedCount, total));
        out.put("focusedContextLuceneTopKTotal", focusedContextLuceneTopKTotal);
        out.put("focusedContextKeywordHitsTotal", focusedContextKeywordHitsTotal);
        out.put("avgFocusedContextLuceneTopK", round6((double) focusedContextLuceneTopKTotal / Math.max(1, focusedContextAppliedCount)));
        out.put("avgFocusedContextKeywordHits", round6((double) focusedContextKeywordHitsTotal / Math.max(1, focusedContextAppliedCount)));
        out.put("analyzeSlidingWindowAppliedCount", analyzeSlidingWindowAppliedCount);
        out.put("analyzeSlidingWindowAppliedRate", ratio(analyzeSlidingWindowAppliedCount, total));
        out.put("analyzeSlidingWindowCpuCappedCount", analyzeSlidingWindowCpuCappedCount);
        out.put("analyzeSlidingWindowCpuCappedRate", ratio(analyzeSlidingWindowCpuCappedCount, total));
        out.put("analyzeSlidingWindowCountTotal", analyzeSlidingWindowCountTotal);
        out.put("analyzeSlidingWindowCharsUsedTotal", analyzeSlidingWindowCharsUsedTotal);
        out.put("avgAnalyzeSlidingWindowCount", round6((double) analyzeSlidingWindowCountTotal / Math.max(1, analyzeSlidingWindowAppliedCount)));
        out.put("avgAnalyzeSlidingWindowCharsUsed", round6((double) analyzeSlidingWindowCharsUsedTotal / Math.max(1, analyzeSlidingWindowAppliedCount)));
        out.put("avgAnalyzeSlidingWindowMaxWindowsEffective", round6((double) analyzeSlidingWindowMaxWindowsEffectiveTotal / Math.max(1, analyzeSlidingWindowAppliedCount)));
        out.put("byLocalPreAnalysisReasonCode", localPreAnalysisReasonCounts);
        out.put("byFlow", flowCounts);
        out.put("byRoutingTier", routingTierCounts);
        out.put("byOutputShape", outputShapeCounts);
        return out;
    }

    private Map<String, Object> buildHourlyBuckets(List<AiTelemetryMetric> events) {
        Map<String, Map<String, Object>> buckets = new LinkedHashMap<>();
        if (events != null) {
            for (AiTelemetryMetric m : events) {
                if (m == null) continue;
                String bucket = HOUR_BUCKET_FORMATTER.format(Instant.ofEpochMilli(m.timestamp));
                Map<String, Object> agg = buckets.computeIfAbsent(bucket, k -> new LinkedHashMap<>());
                incLong(agg, "events", 1);
                incLong(agg, "inputTokens", Math.max(0, m.inputTokens + m.promptTokens));
                incLong(agg, "outputTokens", Math.max(0, m.outputTokens + m.completionTokens));
                incLong(agg, "fallbackEvents", (m.providerFallbackUsed || m.usedGeminiFallback || m.switchedToDefaultModel) ? 1 : 0);
                incLong(agg, "quickProbeEvents", m.usedQuickProbe ? 1 : 0);
                incLong(agg, "skipQuickProbeEvents", m.skippedQuickProbe ? 1 : 0);
                incLong(agg, "directProviderEvents", m.usedDirectProviderRoute ? 1 : 0);
                incLong(agg, "inputBudgetGuardEvents", (m.inputBudgetGuardTriggered || "input_budget_guard".equalsIgnoreCase(toText(m.taskType))) ? 1 : 0);
                incLong(agg, "textEditsLineEvents", "text_edits_line".equalsIgnoreCase(toText(m.outputShape)) ? 1 : 0);
                incLong(agg, "fullCodeFallbackEvents", (m.fallbackToFullCode || "full_code".equalsIgnoreCase(toText(m.outputShape))) ? 1 : 0);
                incLong(agg, "textEditsRetryTriggeredEvents", m.textEditsRetryTriggered ? 1 : 0);
                incLong(agg, "textEditsRetrySuccessEvents", (m.textEditsRetryTriggered && "text_edits_line".equalsIgnoreCase(toText(m.outputShape))) ? 1 : 0);
                incLong(agg, "textEditsTotal", Math.max(0, m.textEditsCount));
                incLong(agg, "attemptsUsedTotal", Math.max(0, m.attemptsUsed));
                incLong(agg, "providerCallsEstimateTotal", Math.max(0, m.providerCallsEstimate));
                incLong(agg, "estimatedSavedTokensTotal", Math.max(0, m.estimatedSavedTokens));
                incLong(agg, "localPreAnalysisAttemptedEvents", m.localPreAnalysisAttempted ? 1 : 0);
                incLong(agg, "localPreAnalysisHandledEvents", m.localPreAnalysisHandled ? 1 : 0);
                incLong(agg, "localPreAnalysisCloudContextInjectedEvents", m.localPreAnalysisCloudContextInjected ? 1 : 0);
                incLong(agg, "focusedContextAppliedEvents", m.focusedContextApplied ? 1 : 0);
                incLong(agg, "focusedContextCursorWindowIncludedEvents", m.focusedContextCursorWindowIncluded ? 1 : 0);
                incLong(agg, "focusedContextLuceneTopKTotal", Math.max(0, m.focusedContextLuceneTopKCount));
                incLong(agg, "focusedContextKeywordHitsTotal", Math.max(0, m.focusedContextKeywordHits));
                incLong(agg, "analyzeSlidingWindowAppliedEvents", m.analyzeSlidingWindowApplied ? 1 : 0);
                incLong(agg, "analyzeSlidingWindowCpuCappedEvents", m.analyzeSlidingWindowCpuCapped ? 1 : 0);
                incLong(agg, "analyzeSlidingWindowCountTotal", Math.max(0, m.analyzeSlidingWindowCount));
                incLong(agg, "analyzeSlidingWindowCharsUsedTotal", Math.max(0, m.analyzeSlidingWindowCharsUsed));
                incDouble(agg, "estimatedCostUsd", Math.max(0.0, m.estimatedCostUsd));
            }
        }
        return new LinkedHashMap<>(buckets);
    }

    private Map<String, Object> buildDailyBuckets(List<AiTelemetryMetric> events, int lastDays) {
        int safeDays = Math.max(1, Math.min(60, lastDays));
        long startMs = System.currentTimeMillis() - safeDays * 24L * 3600_000L;
        Map<String, Map<String, Object>> buckets = new LinkedHashMap<>();

        if (events != null) {
            for (AiTelemetryMetric m : events) {
                if (m == null || m.timestamp < startMs) continue;
                String bucket = DAY_BUCKET_FORMATTER.format(Instant.ofEpochMilli(m.timestamp));
                Map<String, Object> agg = buckets.computeIfAbsent(bucket, k -> new LinkedHashMap<>());
                incLong(agg, "events", 1);
                incLong(agg, "inputTokens", Math.max(0, m.inputTokens + m.promptTokens));
                incLong(agg, "outputTokens", Math.max(0, m.outputTokens + m.completionTokens));
                incLong(agg, "fallbackEvents", (m.providerFallbackUsed || m.usedGeminiFallback || m.switchedToDefaultModel) ? 1 : 0);
                incLong(agg, "inputBudgetGuardEvents", (m.inputBudgetGuardTriggered || "input_budget_guard".equalsIgnoreCase(toText(m.taskType))) ? 1 : 0);
                incLong(agg, "textEditsLineEvents", "text_edits_line".equalsIgnoreCase(toText(m.outputShape)) ? 1 : 0);
                incLong(agg, "fullCodeFallbackEvents", (m.fallbackToFullCode || "full_code".equalsIgnoreCase(toText(m.outputShape))) ? 1 : 0);
                incLong(agg, "textEditsRetryTriggeredEvents", m.textEditsRetryTriggered ? 1 : 0);
                incLong(agg, "textEditsRetrySuccessEvents", (m.textEditsRetryTriggered && "text_edits_line".equalsIgnoreCase(toText(m.outputShape))) ? 1 : 0);
                incLong(agg, "textEditsTotal", Math.max(0, m.textEditsCount));
                incLong(agg, "attemptsUsedTotal", Math.max(0, m.attemptsUsed));
                incLong(agg, "providerCallsEstimateTotal", Math.max(0, m.providerCallsEstimate));
                incLong(agg, "estimatedSavedTokensTotal", Math.max(0, m.estimatedSavedTokens));
                incLong(agg, "localPreAnalysisAttemptedEvents", m.localPreAnalysisAttempted ? 1 : 0);
                incLong(agg, "localPreAnalysisHandledEvents", m.localPreAnalysisHandled ? 1 : 0);
                incLong(agg, "localPreAnalysisCloudContextInjectedEvents", m.localPreAnalysisCloudContextInjected ? 1 : 0);
                incLong(agg, "focusedContextAppliedEvents", m.focusedContextApplied ? 1 : 0);
                incLong(agg, "focusedContextCursorWindowIncludedEvents", m.focusedContextCursorWindowIncluded ? 1 : 0);
                incLong(agg, "focusedContextLuceneTopKTotal", Math.max(0, m.focusedContextLuceneTopKCount));
                incLong(agg, "focusedContextKeywordHitsTotal", Math.max(0, m.focusedContextKeywordHits));
                incLong(agg, "analyzeSlidingWindowAppliedEvents", m.analyzeSlidingWindowApplied ? 1 : 0);
                incLong(agg, "analyzeSlidingWindowCpuCappedEvents", m.analyzeSlidingWindowCpuCapped ? 1 : 0);
                incLong(agg, "analyzeSlidingWindowCountTotal", Math.max(0, m.analyzeSlidingWindowCount));
                incLong(agg, "analyzeSlidingWindowCharsUsedTotal", Math.max(0, m.analyzeSlidingWindowCharsUsed));
                incDouble(agg, "estimatedCostUsd", Math.max(0.0, m.estimatedCostUsd));
            }
        }

        return new LinkedHashMap<>(buckets);
    }

    private Map<String, Object> buildTelemetryAlerts(
            List<AiTelemetryMetric> windowEvents,
            double fallbackAlertThreshold,
            double quickProbeAlertThreshold,
            int minSamplesForAlert) {
        int total = windowEvents == null ? 0 : windowEvents.size();
        int fallbackCount = 0;
        int quickProbeCount = 0;
        int fullCodeFallbackCount = 0;
        int retryTriggeredCount = 0;
        int retrySuccessCount = 0;
        int attemptsSpikeCount = 0;
        int providerCallSpikeCount = 0;
        int inputBudgetGuardCount = 0;
        int analyzeSlidingWindowCpuCappedCount = 0;
        if (windowEvents != null) {
            for (AiTelemetryMetric m : windowEvents) {
                if (m == null) continue;
                if (m.providerFallbackUsed || m.usedGeminiFallback || m.switchedToDefaultModel) fallbackCount++;
                if (m.usedQuickProbe) quickProbeCount++;
                if (m.fallbackToFullCode || "full_code".equalsIgnoreCase(toText(m.outputShape))) fullCodeFallbackCount++;
                if (m.textEditsRetryTriggered) {
                    retryTriggeredCount++;
                    if ("text_edits_line".equalsIgnoreCase(toText(m.outputShape))) {
                        retrySuccessCount++;
                    }
                }
                if (m.attemptsUsed >= 2) attemptsSpikeCount++;
                if (m.providerCallsEstimate >= 3) providerCallSpikeCount++;
                if (m.inputBudgetGuardTriggered || "input_budget_guard".equalsIgnoreCase(toText(m.taskType))) inputBudgetGuardCount++;
                if (m.analyzeSlidingWindowCpuCapped) analyzeSlidingWindowCpuCappedCount++;
            }
        }

        double fallbackRate = ratio(fallbackCount, total);
        double quickProbeRate = ratio(quickProbeCount, total);
        double fullCodeFallbackRate = ratio(fullCodeFallbackCount, total);
        double retryTriggeredRate = ratio(retryTriggeredCount, total);
        double retrySuccessRate = ratio(retrySuccessCount, Math.max(1, retryTriggeredCount));
        double attemptsSpikeRate = ratio(attemptsSpikeCount, total);
        double providerCallSpikeRate = ratio(providerCallSpikeCount, total);
        double inputBudgetGuardRate = ratio(inputBudgetGuardCount, total);
        double analyzeSlidingWindowCpuCappedRate = ratio(analyzeSlidingWindowCpuCappedCount, total);
        boolean enoughSamples = total >= minSamplesForAlert;
        boolean fallbackSpike = enoughSamples && fallbackRate >= Math.max(0.05, fallbackAlertThreshold);
        boolean quickProbeSpike = enoughSamples && quickProbeRate >= Math.max(0.05, quickProbeAlertThreshold);
        boolean fullCodeFallbackSpike = enoughSamples && fullCodeFallbackRate >= 0.25;
        boolean attemptsSpike = enoughSamples && attemptsSpikeRate >= 0.30;
        boolean providerCallSpike = enoughSamples && providerCallSpikeRate >= 0.30;
        boolean inputBudgetGuardSpike = enoughSamples && inputBudgetGuardRate >= 0.20;
        boolean analyzeSlidingWindowCpuCapSpike = enoughSamples && analyzeSlidingWindowCpuCappedRate >= 0.20;

        List<Map<String, Object>> alertItems = new ArrayList<>();
        if (fallbackSpike) {
            alertItems.add(Map.of(
                "type", "fallback_spike",
                "severity", fallbackRate >= 0.5 ? "high" : "warning",
                "value", round6(fallbackRate),
                "threshold", round6(Math.max(0.05, fallbackAlertThreshold)),
                "message", "Fallback rate vượt ngưỡng, cần tăng ổn định route/prompt budget"));
        }
        if (quickProbeSpike) {
            alertItems.add(Map.of(
                "type", "quick_probe_spike",
                "severity", quickProbeRate >= 0.5 ? "high" : "warning",
                "value", round6(quickProbeRate),
                "threshold", round6(Math.max(0.05, quickProbeAlertThreshold)),
                "message", "Quick-probe rate cao, nên nới budget hoặc tăng ngưỡng skip-probe"));
        }
        if (fullCodeFallbackSpike) {
            alertItems.add(Map.of(
                "type", "full_code_fallback_spike",
                "severity", fullCodeFallbackRate >= 0.45 ? "high" : "warning",
                "value", round6(fullCodeFallbackRate),
                "threshold", 0.25,
                "message", "Tỷ lệ full-code fallback cao, nên siết prompt contract hoặc tăng text-edits retry"));
        }
        if (attemptsSpike) {
            alertItems.add(Map.of(
                "type", "attempts_spike",
                "severity", attemptsSpikeRate >= 0.45 ? "high" : "warning",
                "value", round6(attemptsSpikeRate),
                "threshold", 0.30,
                "message", "Nhiều request phải chạy >=2 attempts, cần giảm strictness hoặc tăng salvage local"));
        }
        if (analyzeSlidingWindowCpuCapSpike) {
            alertItems.add(Map.of(
                "type", "analyze_sliding_window_cpu_cap_spike",
                "severity", analyzeSlidingWindowCpuCappedRate >= 0.35 ? "high" : "warning",
                "value", round6(analyzeSlidingWindowCpuCappedRate),
                "threshold", 0.20,
                "message", "Tỷ lệ sliding-window bị CPU cap cao, nên giảm tải đồng thời hoặc tinh chỉnh window/step"));
        }
        if (providerCallSpike) {
            alertItems.add(Map.of(
                "type", "provider_calls_spike",
                "severity", providerCallSpikeRate >= 0.45 ? "high" : "warning",
                "value", round6(providerCallSpikeRate),
                "threshold", 0.30,
                "message", "Số lần gọi provider/request cao bất thường, cần rà fallback loop và quota policy"));
        }
            if (inputBudgetGuardSpike) {
                alertItems.add(Map.of(
                "type", "input_budget_guard_spike",
                "severity", inputBudgetGuardRate >= 0.35 ? "high" : "warning",
                "value", round6(inputBudgetGuardRate),
                "threshold", 0.20,
                "message", "Nhiều request bị chặn bởi input budget guard, cần giảm context rác hoặc nới prompt budget có kiểm soát"));
            }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalEvents", total);
        out.put("fallbackRate", round6(fallbackRate));
        out.put("quickProbeRate", round6(quickProbeRate));
        out.put("fullCodeFallbackRate", round6(fullCodeFallbackRate));
        out.put("textEditsRetryTriggeredRate", round6(retryTriggeredRate));
        out.put("textEditsRetrySuccessRate", round6(retrySuccessRate));
        out.put("attemptsSpikeRate", round6(attemptsSpikeRate));
        out.put("providerCallSpikeRate", round6(providerCallSpikeRate));
        out.put("inputBudgetGuardRate", round6(inputBudgetGuardRate));
        out.put("analyzeSlidingWindowCpuCappedRate", round6(analyzeSlidingWindowCpuCappedRate));
        out.put("minSamplesForAlert", minSamplesForAlert);
        out.put("fallbackSpike", fallbackSpike);
        out.put("quickProbeSpike", quickProbeSpike);
        out.put("fullCodeFallbackSpike", fullCodeFallbackSpike);
        out.put("attemptsSpike", attemptsSpike);
        out.put("providerCallSpike", providerCallSpike);
        out.put("inputBudgetGuardSpike", inputBudgetGuardSpike);
        out.put("analyzeSlidingWindowCpuCapSpike", analyzeSlidingWindowCpuCapSpike);
        out.put("items", alertItems);
        return out;
    }

    private Map<String, Object> buildAdaptiveBudgetRecommendations(Map<String, Object> alerts, Map<String, Object> summary) {
        boolean fallbackSpike = toBool(alerts == null ? null : alerts.get("fallbackSpike"));
        boolean quickProbeSpike = toBool(alerts == null ? null : alerts.get("quickProbeSpike"));
        boolean fullCodeFallbackSpike = toBool(alerts == null ? null : alerts.get("fullCodeFallbackSpike"));
        boolean inputBudgetGuardSpike = toBool(alerts == null ? null : alerts.get("inputBudgetGuardSpike"));
        boolean analyzeSlidingWindowCpuCapSpike = toBool(alerts == null ? null : alerts.get("analyzeSlidingWindowCpuCapSpike"));
        int totalEvents = toInt(summary == null ? null : summary.get("totalEvents"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", totalEvents > 0);
        out.put("mode", (fallbackSpike || quickProbeSpike || fullCodeFallbackSpike || inputBudgetGuardSpike || analyzeSlidingWindowCpuCapSpike) ? "scale_up_budget" : "scale_down_budget");

        List<Map<String, Object>> actions = new ArrayList<>();
        if (fallbackSpike || quickProbeSpike || fullCodeFallbackSpike || inputBudgetGuardSpike) {
            actions.add(adjustment("ai.assistant.prompt-budget.menu.max-chars", 1.15, "increase"));
            actions.add(adjustment("ai.assistant.prompt-budget.code.max-chars", 1.10, "increase"));
            actions.add(adjustment("ai.code-stream.routing.retry-default-max-prompt-chars", 1.10, "increase"));
            if (inputBudgetGuardSpike) {
                actions.add(adjustment("ai.streaming.prompt-hard-char-cap", 1.08, "increase"));
            }
            if (fullCodeFallbackSpike) {
                actions.add(adjustment("ai.code-stream.edit.text-edits-retry.max-extra-attempts", 2.0, "increase"));
            }
            if (analyzeSlidingWindowCpuCapSpike) {
                actions.add(adjustment("ai.code-stream.analyze.sliding-window.max-windows", 0.80, "decrease"));
                actions.add(adjustment("ai.code-stream.analyze.sliding-window.step-chars", 1.15, "increase"));
            }
        } else {
            actions.add(adjustment("ai.assistant.prompt-budget.menu.max-chars", 0.95, "decrease"));
            actions.add(adjustment("ai.assistant.prompt-budget.code.max-chars", 0.95, "decrease"));
            actions.add(adjustment("ai.code-stream.routing.retry-default-max-prompt-chars", 0.95, "decrease"));
        }
        out.put("actions", actions);
        out.put("note", "Đề xuất tự động để điều chỉnh budget động; áp dụng qua config rollout sau khi xác minh.");
        return out;
    }

    private Map<String, Object> adjustment(String key, double ratio, String direction) {
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("configKey", key);
        action.put("direction", direction);
        action.put("ratio", round6(ratio));
        return action;
    }

    private void pruneAiTelemetryHistoryIfNeeded(int maxItems) {
        int safeMax = Math.max(500, maxItems);
        synchronized (aiTelemetryHistory) {
            int extra = aiTelemetryHistory.size() - safeMax;
            if (extra <= 0) {
                return;
            }
            aiTelemetryHistory.subList(0, extra).clear();
        }
    }

    private static void incLong(Map<String, Object> map, String key, long delta) {
        long value = 0;
        Object current = map.get(key);
        if (current instanceof Number n) {
            value = n.longValue();
        } else if (current != null) {
            try {
                value = Long.parseLong(String.valueOf(current));
            } catch (Exception ignored) {
                value = 0;
            }
        }
        map.put(key, value + Math.max(0, delta));
    }

    private static void incDouble(Map<String, Object> map, String key, double delta) {
        double value = 0.0;
        Object current = map.get(key);
        if (current instanceof Number n) {
            value = n.doubleValue();
        } else if (current != null) {
            try {
                value = Double.parseDouble(String.valueOf(current));
            } catch (Exception ignored) {
                value = 0.0;
            }
        }
        map.put(key, value + Math.max(0.0, delta));
    }

    private static double ratio(int n, int d) {
        if (d <= 0) return 0.0;
        return (double) n / (double) d;
    }

    private static double round6(double v) {
        return Math.round(v * 1_000_000d) / 1_000_000d;
    }

    private static String toText(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private static int toInt(Object raw) {
        if (raw == null) return 0;
        if (raw instanceof Number n) return Math.max(0, n.intValue());
        try {
            return Math.max(0, (int) Math.round(Double.parseDouble(String.valueOf(raw).trim())));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static long toLong(Object raw, long fallback) {
        if (raw == null) return fallback;
        if (raw instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static double toDouble(Object raw) {
        if (raw == null) return 0.0;
        if (raw instanceof Number n) return Math.max(0.0, n.doubleValue());
        try {
            return Math.max(0.0, Double.parseDouble(String.valueOf(raw).trim()));
        } catch (Exception ignored) {
            return 0.0;
        }
    }

    private static boolean toBool(Object raw) {
        if (raw instanceof Boolean b) return b;
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase(Locale.ROOT);
        return "1".equals(text) || "true".equals(text) || "yes".equals(text) || "y".equals(text);
    }

    private double calculateEstimatedCost(int inputTokens, int outputTokens) {
        double inputCost = (inputTokens / 1_000_000.0) * (INPUT_COST_PER_1M_TOKENS * 1_000_000);
        double outputCost = (outputTokens / 1_000_000.0) * (OUTPUT_COST_PER_1M_TOKENS * 1_000_000);
        return inputCost + outputCost;
    }

    private double calculateCostSavingsRatio() {
        long total = totalApiCallCount.get() + totalLocalProcessCount.get();
        if (total == 0) return 0;
        return (double) totalLocalProcessCount.get() / total;
    }

    private String generateCallId() {
        return "call_" + UUID.randomUUID().toString().substring(0, 8) + "_" + System.currentTimeMillis();
    }

    public void clearHistory() {
        callHistory.clear();
        aiTelemetryHistory.clear();
        totalApiCallCount.set(0);
        totalLocalProcessCount.set(0);
        totalGeminiCostVND.set(0);
    }

    /**
     * Record quality gate check (non-API tracking)
     */
    public void recordQualityCheck(String checkType, int itemCount, double score, boolean passed) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event_type", "quality_check");
        event.put("check_type", checkType);
        event.put("item_count", itemCount);
        event.put("quality_score", score);
        event.put("passed", passed);
        event.put("timestamp", System.currentTimeMillis());
        // Can be logged or stored as needed
    }
}
