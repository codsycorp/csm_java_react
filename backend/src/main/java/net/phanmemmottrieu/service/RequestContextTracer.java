package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Request Context Tracer
 * Tracks end-to-end timing from request start through all phases
 *
 * Fixes the timing mismatch issue: Each service tracks its own time, but total doesn't match
 * This service provides a unified timeline view
 *
 * FEATURES:
 * 1. Request-level lifecycle tracking (start → phases → end)
 * 2. Accurate end-to-end timing (from first touch to final response)
 * 3. Phase-level metrics (each step's duration)
 * 4. Custom metrics recording (for monitoring)
 * 5. Error tracking
 * 6. Automatic cleanup (200 request limit with LRU eviction)
 *
 * USAGE:
 * 1. tracer.startRequest(requestId) - Called when request arrives
 * 2. tracer.startPhase(phaseName, requestId) - Enter a phase
 * 3. tracer.endPhase(phaseName, requestId, durationMs) - Exit phase
 * 4. tracer.recordMetric(requestId, key, value) - Record custom metric
 * 5. tracer.elapsedSinceRequestStart(requestId) - Get total elapsed time
 *
 * @author Mr.Anh
 */
@Service
public class RequestContextTracer {

    private static final Logger log = LoggerFactory.getLogger(RequestContextTracer.class);

    private static class PhaseMetrics {
        String phaseName;
        long startMs;
        long durationMs;

        PhaseMetrics(String phaseName, long startMs) {
            this.phaseName = phaseName;
            this.startMs = startMs;
        }

        void complete(long endMs) {
            this.durationMs = endMs - startMs;
        }
    }

    private static class RequestContext {
        String requestId;
        long requestStartMs;
        long requestEndMs;
        Map<String, PhaseMetrics> phases = new LinkedHashMap<>();
        Map<String, Long> metrics = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        String status; // running | completed | error

        RequestContext(String requestId) {
            this.requestId = requestId;
            this.requestStartMs = System.currentTimeMillis();
            this.status = "running";
        }

        void complete() {
            this.requestEndMs = System.currentTimeMillis();
            this.status = "completed";
        }

        void error() {
            this.status = "error";
        }

        long totalDurationMs() {
            if (requestEndMs > 0) {
                return requestEndMs - requestStartMs;
            }
            return System.currentTimeMillis() - requestStartMs;
        }

        Map<String, Object> summarize() {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("requestId", requestId);
            summary.put("totalDurationMs", totalDurationMs());
            summary.put("status", status);
            summary.put("phases", phases.size());
            summary.put("metrics", metrics.size());

            // Phase breakdown
            Map<String, Long> phaseBreakdown = new LinkedHashMap<>();
            for (PhaseMetrics phase : phases.values()) {
                phaseBreakdown.put(phase.phaseName, phase.durationMs);
            }
            summary.put("phaseBreakdown", phaseBreakdown);

            // Custom metrics
            summary.put("customMetrics", metrics);

            // Errors
            if (!errors.isEmpty()) {
                summary.put("errors", errors);
            }

            return summary;
        }
    }

    // Thread-local request context (for non-Spring thread contexts)
    private static final ThreadLocal<String> currentRequestId = new ThreadLocal<>();

    // Global request map with LRU eviction
    private final Map<String, RequestContext> requestContexts = new LinkedHashMap<String, RequestContext>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, RequestContext> eldest) {
            return size() > 200; // Keep only 200 recent requests
        }
    };

    /**
     * Start tracking a new request
     */
    public void startRequest(String requestId) {
        ensureContext(requestId);
        currentRequestId.set(requestId);
        log.debug("Request started: {}", requestId);
    }

    /**
     * Start a named phase within current request
     */
    public void startPhase(String phaseName, String requestId) {
        RequestContext ctx = ensureContext(requestId);

        PhaseMetrics phase = new PhaseMetrics(phaseName, System.currentTimeMillis());
        ctx.phases.put(phaseName, phase);
        log.debug("Phase started: {} in request {}", phaseName, requestId);
    }

    /**
     * End a named phase
     */
    public void endPhase(String phaseName, String requestId, long durationMs) {
        RequestContext ctx = ensureContext(requestId);

        PhaseMetrics phase = ctx.phases.get(phaseName);
        if (phase == null) {
            log.warn("Phase not found: {} in request {}", phaseName, requestId);
            return;
        }

        phase.complete(phase.startMs + durationMs);
        log.debug("Phase completed: {} ({}ms) in request {}", phaseName, durationMs, requestId);
    }

    /**
     * Record a custom metric
     */
    public void recordMetric(String requestId, String key, long value) {
        RequestContext ctx = ensureContext(requestId);
        ctx.metrics.put(key, value);
    }

    /**
     * Record an error
     */
    public void recordError(String requestId, String errorKey, String errorMsg) {
        RequestContext ctx = ensureContext(requestId);
        ctx.errors.add(String.format("%s: %s", errorKey, errorMsg));
        ctx.error();
    }

    /**
     * Get elapsed time since request started
     */
    public long elapsedSinceRequestStart(String requestId) {
        RequestContext ctx = ensureContext(requestId);
        return ctx.totalDurationMs();
    }

    /**
     * Mark request as complete
     */
    public void completeRequest(String requestId) {
        RequestContext ctx = ensureContext(requestId);
        ctx.complete();
        currentRequestId.remove();
        log.debug("Request completed: {} ({}ms)", requestId, ctx.totalDurationMs());
    }

    private synchronized RequestContext ensureContext(String requestId) {
        String safeRequestId = String.valueOf(requestId == null ? "" : requestId).trim();
        if (safeRequestId.isBlank()) {
            safeRequestId = "request-" + System.currentTimeMillis();
        }
        RequestContext existing = requestContexts.get(safeRequestId);
        if (existing != null) {
            return existing;
        }
        RequestContext created = new RequestContext(safeRequestId);
        requestContexts.put(safeRequestId, created);
        return created;
    }

    /**
     * Get request context summary
     */
    public Map<String, Object> getSummary(String requestId) {
        RequestContext ctx = requestContexts.get(requestId);
        if (ctx == null) {
            return new LinkedHashMap<>();
        }
        return ctx.summarize();
    }

    /**
     * Get current request ID (for thread-local context)
     */
    public String getCurrentRequestId() {
        return currentRequestId.get();
    }

    /**
     * Get all request summaries (for monitoring dashboard)
     */
    public List<Map<String, Object>> getAllSummaries() {
        List<Map<String, Object>> summaries = new ArrayList<>();
        for (RequestContext ctx : requestContexts.values()) {
            summaries.add(ctx.summarize());
        }
        return summaries;
    }

    /**
     * Get statistics about tracked requests
     */
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("trackedRequests", requestContexts.size());

        // Calculate averages
        if (!requestContexts.isEmpty()) {
            long totalDuration = 0;
            int completedCount = 0;

            for (RequestContext ctx : requestContexts.values()) {
                if ("completed".equals(ctx.status)) {
                    totalDuration += ctx.totalDurationMs();
                    completedCount++;
                }
            }

            if (completedCount > 0) {
                stats.put("avgRequestDurationMs", totalDuration / completedCount);
                stats.put("completedRequests", completedCount);
            }
        }

        return stats;
    }

    /**
     * Clear old requests (manual cleanup)
     */
    public void clearOldRequests() {
        long threshold = System.currentTimeMillis() - 5 * 60_000; // 5 min ago
        int cleared = 0;

        for (Iterator<Map.Entry<String, RequestContext>> it = requestContexts.entrySet().iterator(); it.hasNext();) {
            Map.Entry<String, RequestContext> entry = it.next();
            RequestContext ctx = entry.getValue();
            if (ctx.requestEndMs > 0 && ctx.requestEndMs < threshold) {
                it.remove();
                cleared++;
            }
        }

        log.info("Cleared {} old request contexts", cleared);
    }

    /**
     * Log request summary for debugging
     */
    public void logRequestSummary(String requestId) {
        RequestContext ctx = requestContexts.get(requestId);
        if (ctx == null) {
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("\n═══ REQUEST SUMMARY ═══\n");
        sb.append(String.format("RequestId: %s\n", requestId));
        sb.append(String.format("Total Duration: %dms\n", ctx.totalDurationMs()));
        sb.append(String.format("Status: %s\n", ctx.status));

        sb.append("\nPHASES:\n");
        for (PhaseMetrics phase : ctx.phases.values()) {
            sb.append(String.format("  %s: %dms\n", phase.phaseName, phase.durationMs));
        }

        if (!ctx.metrics.isEmpty()) {
            sb.append("\nMETRICS:\n");
            for (Map.Entry<String, Long> m : ctx.metrics.entrySet()) {
                sb.append(String.format("  %s: %d\n", m.getKey(), m.getValue()));
            }
        }

        if (!ctx.errors.isEmpty()) {
            sb.append("\nERRORS:\n");
            for (String error : ctx.errors) {
                sb.append(String.format("  %s\n", error));
            }
        }

        sb.append("════════════════════════\n");
        log.info(sb.toString());
    }
}
