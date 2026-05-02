package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.Iterator;
import java.util.Map;

/**
 * Shared prompt-budget helper used across controller and streaming layers.
 * Keeps prompt normalization and token estimation consistent.
 *
 * <p>Supports two rollout profiles via {@code ai.prompt.budget.profile}:
 * <ul>
 *   <li>{@code safe}       — conservative limits, suitable for production rollout</li>
 *   <li>{@code aggressive} — tighter limits for cost-sensitive environments</li>
 * </ul>
 */
@Service
public class AiPromptBudgetService {

    /**
     * Rollout profile: "safe" (default) or "aggressive".
     * Controls the effective soft-token limits returned by
     * {@link #resolveGeminiSoftLimit()} / {@link #resolveClaudeSoftLimit()} /
     * {@link #resolveHardCharCap()}.
     */
    @Value("${ai.prompt.budget.profile:safe}")
    private String profile;

    // ---- safe-profile defaults ----
    @Value("${ai.prompt.budget.safe.gemini-soft-limit:6800}")
    private int safeGeminiSoftLimit;
    @Value("${ai.prompt.budget.safe.claude-soft-limit:9000}")
    private int safeClaudeSoftLimit;
    @Value("${ai.prompt.budget.safe.hard-char-cap:1200000}")
    private int safeHardCharCap;

    // ---- aggressive-profile defaults ----
    @Value("${ai.prompt.budget.aggressive.gemini-soft-limit:4500}")
    private int aggressiveGeminiSoftLimit;
    @Value("${ai.prompt.budget.aggressive.claude-soft-limit:6000}")
    private int aggressiveClaudeSoftLimit;
    @Value("${ai.prompt.budget.aggressive.hard-char-cap:800000}")
    private int aggressiveHardCharCap;

    /** Active rollout profile name. */
    public String getProfile() {
        return isAggressive() ? "aggressive" : "safe";
    }

    private boolean isAggressive() {
        return "aggressive".equalsIgnoreCase(profile == null ? "" : profile.trim());
    }

    /** Effective Gemini input-token soft limit for the active profile. */
    public int resolveGeminiSoftLimit() {
        return isAggressive() ? aggressiveGeminiSoftLimit : safeGeminiSoftLimit;
    }

    /** Effective Claude input-token soft limit for the active profile. */
    public int resolveClaudeSoftLimit() {
        return isAggressive() ? aggressiveClaudeSoftLimit : safeClaudeSoftLimit;
    }

    /** Effective hard char cap for the active profile (used in normalizePrompt). */
    public int resolveHardCharCap() {
        return isAggressive() ? aggressiveHardCharCap : safeHardCharCap;
    }

    public String normalizePrompt(String raw, int hardCapChars) {
        String normalized = String.valueOf(raw == null ? "" : raw)
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .replaceAll("[\\t ]+", " ")
                .replaceAll("\\n{4,}", "\n\n\n")
                .trim();
        if (normalized.isEmpty()) {
            return "";
        }
        int safeCap = Math.max(1000, hardCapChars);
        if (normalized.length() <= safeCap) {
            return normalized;
        }
        return normalized.substring(0, safeCap);
    }

    public int estimateTokensByChars(String text, int charsPerToken) {
        int chars = Math.max(0, String.valueOf(text == null ? "" : text).length());
        return estimateTokensByChars(chars, charsPerToken);
    }

    public int estimateTokensByChars(int chars, int charsPerToken) {
        if (chars <= 0) {
            return 0;
        }
        int safeCharsPerToken = Math.max(2, charsPerToken);
        return (chars + safeCharsPerToken - 1) / safeCharsPerToken;
    }

    // ─── Session cumulative char budget (OpenDevin MAX_CHARS + state.num_of_chars pattern) ───

    /**
     * Per-session char accumulator.
     * Key format: "{appId}:{flow}" e.g. "myapp:chat" or "myapp:code".
     * Inspired by OpenDevin's AgentController.state.num_of_chars cumulative tracking,
     * which raises MaxCharsExceedError when the session total exceeds MAX_CHARS.
     */
    private final ConcurrentHashMap<String, long[]> sessionCharAccumulator = new ConcurrentHashMap<>();
    // long[0] = accumulated chars in current window, long[1] = window start time ms

    @Value("${ai.session.budget.window-ms:3600000}")
    private long sessionBudgetWindowMs;

    @Value("${ai.session.budget.safe-max-chars:20000000}")
    private long sessionBudgetSafeMaxChars;

    @Value("${ai.session.budget.aggressive-max-chars:12000000}")
    private long sessionBudgetAggressiveMaxChars;

    /**
     * Record chars consumed in a session and check if the session is over budget.
     *
     * @param sessionKey  e.g. appId + ":" + flow
     * @param inputChars  chars in the prompt
     * @param outputChars chars in the response
     * @return true if the session has exceeded its budget for the current window
     */
    public boolean recordAndCheckSessionBudget(String sessionKey, int inputChars, int outputChars) {
        if (sessionKey == null || sessionKey.isBlank()) return false;
        long now = System.currentTimeMillis();
        long windowMs = Math.max(60_000L, sessionBudgetWindowMs);
        long maxChars = isAggressive() ? sessionBudgetAggressiveMaxChars : sessionBudgetSafeMaxChars;

        long[] entry = sessionCharAccumulator.compute(sessionKey, (k, v) -> {
            if (v == null || (now - v[1]) > windowMs) {
                // Start a new window
                return new long[]{ Math.max(0, inputChars) + Math.max(0, outputChars), now };
            }
            v[0] += Math.max(0, inputChars) + Math.max(0, outputChars);
            return v;
        });

        return entry[0] > maxChars;
    }

    /**
     * Get accumulated chars for a session in the current window.
     */
    public long getSessionAccumulatedChars(String sessionKey) {
        if (sessionKey == null || sessionKey.isBlank()) return 0L;
        long[] entry = sessionCharAccumulator.get(sessionKey);
        if (entry == null) return 0L;
        long now = System.currentTimeMillis();
        long windowMs = Math.max(60_000L, sessionBudgetWindowMs);
        if ((now - entry[1]) > windowMs) return 0L; // window expired
        return entry[0];
    }

    /**
     * Prune stale session budget entries (windows older than windowMs).
     * Should be called periodically (e.g. from a scheduled task or on each request).
     */
    public int pruneStaleSessionBudgets() {
        long now = System.currentTimeMillis();
        long windowMs = Math.max(60_000L, sessionBudgetWindowMs);
        int removed = 0;
        Iterator<Map.Entry<String, long[]>> it = sessionCharAccumulator.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, long[]> entry = it.next();
            if ((now - entry.getValue()[1]) > windowMs * 2) {
                it.remove();
                removed++;
            }
        }
        return removed;
    }
}
