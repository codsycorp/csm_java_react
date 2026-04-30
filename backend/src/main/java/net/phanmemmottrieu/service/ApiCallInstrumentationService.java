package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * API Call Instrumentation Service
 * Tracking chi phí API calls để đảm bảo tối ưu chi phí Gemini 2.5 Pro
 */
@Service
public class ApiCallInstrumentationService {

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

    private final List<ApiCallMetric> callHistory = Collections.synchronizedList(new ArrayList<>());
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
