package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Real-time quality metrics aggregation service.
 *
 * Tracks operational KPIs from AI requests over a rolling 1-hour window.
 */
@Service
public class AiQualityMetricsService {

    private static final String APP_GLOBAL_KEY = "__global__";
    private static final long WINDOW_SIZE_MS = 60L * 60L * 1000L; // 1 hour
    private static final long CLEANUP_INTERVAL_MS = 5L * 60L * 1000L; // 5 mins

    private volatile long lastCleanupMs = System.currentTimeMillis();

    private final ScopedMetrics globalMetrics = new ScopedMetrics();
    private final ConcurrentHashMap<String, ScopedMetrics> metricsByApp = new ConcurrentHashMap<>();

    private static class MetricEvent {
        long timestampMs;
        int count;

        MetricEvent(long timestampMs, int count) {
            this.timestampMs = timestampMs;
            this.count = count;
        }
    }

    private static class ScopedMetrics {
        final ConcurrentHashMap<String, LinkedList<MetricEvent>> retryReasonHistory = new ConcurrentHashMap<>();
        final ConcurrentHashMap<String, LinkedList<MetricEvent>> evidenceGateHistory = new ConcurrentHashMap<>();
        final ConcurrentHashMap<String, LinkedList<MetricEvent>> patchRejectHistory = new ConcurrentHashMap<>();
        final ConcurrentHashMap<String, LinkedList<MetricEvent>> validatorRejectHistory = new ConcurrentHashMap<>();
        final LinkedList<MetricEvent> fallbackHistory = new LinkedList<>();

        final AtomicLong totalRequests = new AtomicLong(0L);
        final AtomicLong totalRetries = new AtomicLong(0L);
        final AtomicLong totalFallbacks = new AtomicLong(0L);
        final AtomicLong totalPatchRejects = new AtomicLong(0L);
        final AtomicLong totalValidatorRejects = new AtomicLong(0L);

        boolean isEffectivelyEmpty() {
            return totalRequests.get() == 0L
                && totalRetries.get() == 0L
                && totalFallbacks.get() == 0L
                && totalPatchRejects.get() == 0L
                && totalValidatorRejects.get() == 0L;
        }
    }

    public void recordRetryReason(String reasonClass, int count) {
        recordRetryReason(reasonClass, count, null);
    }

    public void recordRetryReason(String reasonClass, int count, String appId) {
        String key = normalizeMetricKey(reasonClass);
        recordRetryReasonInternal(globalMetrics, key, count);
        recordScoped(appId, scoped -> recordRetryReasonInternal(scoped, key, count));
        tryCleanup();
    }

    public void recordEvidenceGateHit(String gateType, int count) {
        recordEvidenceGateHit(gateType, count, null);
    }

    public void recordEvidenceGateHit(String gateType, int count, String appId) {
        String key = normalizeMetricKey(gateType);
        recordEvidenceGateInternal(globalMetrics, key, count);
        recordScoped(appId, scoped -> recordEvidenceGateInternal(scoped, key, count));
        tryCleanup();
    }

    public void recordPatchReject(String reason, int count) {
        recordPatchReject(reason, count, null);
    }

    public void recordPatchReject(String reason, int count, String appId) {
        String key = normalizeMetricKey(reason);
        recordPatchRejectInternal(globalMetrics, key, count);
        recordScoped(appId, scoped -> recordPatchRejectInternal(scoped, key, count));
        tryCleanup();
    }

    public void recordValidatorReject(String reason, int count) {
        recordValidatorReject(reason, count, null);
    }

    public void recordValidatorReject(String reason, int count, String appId) {
        String key = normalizeMetricKey(reason);
        recordValidatorRejectInternal(globalMetrics, key, count);
        recordScoped(appId, scoped -> recordValidatorRejectInternal(scoped, key, count));
        tryCleanup();
    }

    public void recordFallback() {
        recordFallback(null);
    }

    public void recordFallback(String appId) {
        recordFallbackInternal(globalMetrics);
        recordScoped(appId, this::recordFallbackInternal);
        tryCleanup();
    }

    /**
     * Track retry policy decisions: will_retry or give_up.
     */
    public void recordRetryDecision(String reasonCode, boolean willRetry) {
        String key = normalizeMetricKey((willRetry ? "will_retry_" : "give_up_") + reasonCode);
        recordRetryReason(key, 1, null);
    }

    public Map<String, Object> getMetricsSummary() {
        return getMetricsSummary(null);
    }

    public Map<String, Object> getMetricsSummary(String appId) {
        long now = System.currentTimeMillis();
        tryCleanup();

        String normalizedAppId = normalizeAppId(appId);
        ScopedMetrics metrics = APP_GLOBAL_KEY.equals(normalizedAppId)
            ? globalMetrics
            : metricsByApp.get(normalizedAppId);

        Map<String, Object> result = buildSummaryFrom(metrics == null ? new ScopedMetrics() : metrics, now);
        if (APP_GLOBAL_KEY.equals(normalizedAppId)) {
            result.put("scope", "global");
        } else {
            result.put("scope", "app");
            result.put("app_id", normalizedAppId);
        }
        return result;
    }

    public void reset() {
        resetScoped(globalMetrics);
        metricsByApp.clear();
    }

    public void reset(String appId) {
        String normalizedAppId = normalizeAppId(appId);
        if (APP_GLOBAL_KEY.equals(normalizedAppId)) {
            reset();
            return;
        }
        metricsByApp.remove(normalizedAppId);
    }

    private void recordRetryReasonInternal(ScopedMetrics metrics, String reasonClass, int count) {
        recordEvent(metrics.retryReasonHistory, reasonClass, count);
        metrics.totalRetries.addAndGet(count);
        metrics.totalRequests.incrementAndGet();
    }

    private void recordEvidenceGateInternal(ScopedMetrics metrics, String gateType, int count) {
        recordEvent(metrics.evidenceGateHistory, gateType, count);
        metrics.totalRequests.incrementAndGet();
    }

    private void recordPatchRejectInternal(ScopedMetrics metrics, String reason, int count) {
        recordEvent(metrics.patchRejectHistory, reason, count);
        metrics.totalPatchRejects.addAndGet(count);
        metrics.totalRequests.incrementAndGet();
    }

    private void recordValidatorRejectInternal(ScopedMetrics metrics, String reason, int count) {
        recordEvent(metrics.validatorRejectHistory, reason, count);
        metrics.totalValidatorRejects.addAndGet(count);
        metrics.totalRequests.incrementAndGet();
    }

    private void recordFallbackInternal(ScopedMetrics metrics) {
        synchronized (metrics.fallbackHistory) {
            metrics.fallbackHistory.add(new MetricEvent(System.currentTimeMillis(), 1));
        }
        metrics.totalFallbacks.incrementAndGet();
        metrics.totalRequests.incrementAndGet();
    }

    private void recordScoped(String appId, java.util.function.Consumer<ScopedMetrics> recorder) {
        String normalizedAppId = normalizeAppId(appId);
        if (APP_GLOBAL_KEY.equals(normalizedAppId)) {
            return;
        }
        recorder.accept(metricsByApp.computeIfAbsent(normalizedAppId, ignored -> new ScopedMetrics()));
    }

    private void recordEvent(ConcurrentHashMap<String, LinkedList<MetricEvent>> history, String key, int count) {
        int safeCount = Math.max(1, count);
        LinkedList<MetricEvent> events = history.computeIfAbsent(key, ignored -> new LinkedList<>());
        synchronized (events) {
            events.add(new MetricEvent(System.currentTimeMillis(), safeCount));
        }
    }

    private Map<String, Object> buildSummaryFrom(ScopedMetrics metrics, long now) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("timestamp", now);
        result.put("window_size_ms", WINDOW_SIZE_MS);

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("total_requests", metrics.totalRequests.get());
        totals.put("total_retries", metrics.totalRetries.get());
        totals.put("total_fallbacks", metrics.totalFallbacks.get());
        totals.put("total_patch_rejects", metrics.totalPatchRejects.get());
        totals.put("total_validator_rejects", metrics.totalValidatorRejects.get());
        result.put("totals", totals);

        result.put("retry_reason_distribution", aggregateMetrics(metrics.retryReasonHistory, now));
        result.put("evidence_gate_hits", aggregateMetrics(metrics.evidenceGateHistory, now));
        result.put("patch_reject_reasons", aggregateMetrics(metrics.patchRejectHistory, now));
        result.put("validator_reject_reasons", aggregateMetrics(metrics.validatorRejectHistory, now));

        long totalRequests = metrics.totalRequests.get();
        double fallbackRate = totalRequests > 0 ? (double) metrics.totalFallbacks.get() / totalRequests : 0.0;
        double patchRejectRate = totalRequests > 0 ? (double) metrics.totalPatchRejects.get() / totalRequests : 0.0;
        double validatorRejectRate = totalRequests > 0 ? (double) metrics.totalValidatorRejects.get() / totalRequests : 0.0;

        result.put("fallback_rate", fallbackRate);
        result.put("patch_reject_rate", patchRejectRate);
        result.put("validator_reject_rate", validatorRejectRate);

        return result;
    }

    private Map<String, Integer> aggregateMetrics(
        ConcurrentHashMap<String, LinkedList<MetricEvent>> history,
        long now
    ) {
        Map<String, Integer> result = new LinkedHashMap<>();

        for (Map.Entry<String, LinkedList<MetricEvent>> entry : history.entrySet()) {
            String key = entry.getKey();
            LinkedList<MetricEvent> events = entry.getValue();
            int total = 0;
            synchronized (events) {
                for (MetricEvent event : events) {
                    if (now - event.timestampMs <= WINDOW_SIZE_MS) {
                        total += event.count;
                    }
                }
            }
            if (total > 0) {
                result.put(key, total);
            }
        }

        return result;
    }

    private void tryCleanup() {
        long now = System.currentTimeMillis();
        if (now - lastCleanupMs < CLEANUP_INTERVAL_MS) {
            return;
        }

        lastCleanupMs = now;
        cleanupScoped(globalMetrics, now);

        for (Map.Entry<String, ScopedMetrics> entry : metricsByApp.entrySet()) {
            cleanupScoped(entry.getValue(), now);
            if (entry.getValue().isEffectivelyEmpty()) {
                metricsByApp.remove(entry.getKey(), entry.getValue());
            }
        }
    }

    private void cleanupScoped(ScopedMetrics metrics, long now) {
        cleanupHistoryMap(metrics.retryReasonHistory, now);
        cleanupHistoryMap(metrics.evidenceGateHistory, now);
        cleanupHistoryMap(metrics.patchRejectHistory, now);
        cleanupHistoryMap(metrics.validatorRejectHistory, now);
        synchronized (metrics.fallbackHistory) {
            metrics.fallbackHistory.removeIf(evt -> now - evt.timestampMs > WINDOW_SIZE_MS);
        }
    }

    private void cleanupHistoryMap(ConcurrentHashMap<String, LinkedList<MetricEvent>> history, long now) {
        for (LinkedList<MetricEvent> events : history.values()) {
            synchronized (events) {
                events.removeIf(evt -> now - evt.timestampMs > WINDOW_SIZE_MS);
            }
        }
    }

    private void resetScoped(ScopedMetrics metrics) {
        metrics.retryReasonHistory.clear();
        metrics.evidenceGateHistory.clear();
        metrics.patchRejectHistory.clear();
        metrics.validatorRejectHistory.clear();
        metrics.fallbackHistory.clear();
        metrics.totalRequests.set(0L);
        metrics.totalRetries.set(0L);
        metrics.totalFallbacks.set(0L);
        metrics.totalPatchRejects.set(0L);
        metrics.totalValidatorRejects.set(0L);
    }

    private String normalizeAppId(String appId) {
        String normalized = String.valueOf(appId == null ? "" : appId).trim();
        return normalized.isBlank() ? APP_GLOBAL_KEY : normalized.toLowerCase(Locale.ROOT);
    }

    private String normalizeMetricKey(String raw) {
        String normalized = String.valueOf(raw == null ? "" : raw).trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "unknown" : normalized;
    }
}
