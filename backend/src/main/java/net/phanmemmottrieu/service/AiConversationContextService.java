package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import net.phanmemmottrieu.data.RecordManager;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Persistent conversation context for AI across devices/sessions
 * Stores all historical requests/responses per user to enable:
 * - Conversation continuity without re-sending 3M+ characters
 * - Cross-device context reuse
 * - Smart context windowing for token optimization
 */
@Service
public class AiConversationContextService {

    @Autowired(required = false)
    private RecordManager recordManager;

    private final ConcurrentHashMap<String, ConversationSession> activeSessions = new ConcurrentHashMap<>();
    private static final int MAX_SESSION_HISTORY = 50;
    private static final int CONTEXT_WINDOW_LIMIT = 200000; // chars
    private static final int TURN_REQUEST_SNIPPET_CHARS = 500;
    private static final int TURN_RESPONSE_SNIPPET_CHARS = 1000;
    private static final int TURN_REQUEST_STORE_MAX_CHARS = 4000;
    private static final int TURN_RESPONSE_STORE_MAX_CHARS = 12000;
    private static final int MIN_MEANINGFUL_TURN_CHARS = 8;
    private static final int RECENT_FULL_TURNS_PER_SCOPE = 4;
    private static final int OLDER_SUMMARY_TURNS_PER_SCOPE = 8;
    private static final String SCOPE_USER = "user";
    private static final String SCOPE_APP_SHARED = "app_shared";
    private static final String SCOPE_CODE_TARGET_SHARED = "code_target_shared";
    // Devin TF-IDF-inspired extractive compressor: if aggregated context exceeds this threshold,
    // apply sentence-level extraction (no LLM needed) to keep only high-signal content.
    private static final int EXTRACTIVE_COMPRESS_THRESHOLD_CHARS = 50_000;
    private static final int EXTRACTIVE_COMPRESS_TARGET_CHARS = 30_000;

    public static class ConversationTurn {
        public String turnId;
        public String timestamp;
        public String userRequest;
        public String aiResponse;
        public Map<String, Object> metadata; // costVND, inputTokens, outputTokens, phase, etc.
        public long createdAtMs;
        public int estimatedInputChars;
        public int estimatedOutputChars;

        public ConversationTurn(String userRequest, String aiResponse, Map<String, Object> metadata) {
            this.turnId = UUID.randomUUID().toString();
            this.timestamp = new Date().toString();
            this.userRequest = normalizeTurnText(userRequest, TURN_REQUEST_STORE_MAX_CHARS);
            this.aiResponse = normalizeTurnText(aiResponse, TURN_RESPONSE_STORE_MAX_CHARS);
            this.metadata = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
            this.createdAtMs = System.currentTimeMillis();
            this.estimatedInputChars = (userRequest != null ? userRequest.length() : 0);
            this.estimatedOutputChars = (aiResponse != null ? aiResponse.length() : 0);
        }
    }

    public static class ConversationSession {
        public String sessionId;
        public String userId;
        public String appId;
        public String contextType; // "menu" or "code"
        public List<ConversationTurn> history = new ArrayList<>();
        public long createdAtMs;
        public long lastAccessMs;
        public String lastContext; // compact representation for quick reference
        public int totalInputChars;
        public int totalOutputChars;

        public ConversationSession(String userId, String appId, String contextType) {
            this.sessionId = UUID.randomUUID().toString();
            this.userId = userId;
            this.appId = appId;
            this.contextType = contextType;
            this.createdAtMs = System.currentTimeMillis();
            this.lastAccessMs = System.currentTimeMillis();
            this.totalInputChars = 0;
            this.totalOutputChars = 0;
        }

        public void addTurn(ConversationTurn turn) {
            if (turn == null || !isMeaningfulTurn(turn)) {
                return;
            }
            if (!history.isEmpty()) {
                ConversationTurn last = history.get(history.size() - 1);
                if (isNearDuplicateTurn(last, turn)) {
                    last.createdAtMs = Math.max(last.createdAtMs, turn.createdAtMs);
                    lastAccessMs = System.currentTimeMillis();
                    return;
                }
            }
            if (history.size() >= MAX_SESSION_HISTORY) {
                ConversationTurn removed = history.remove(0); // Remove oldest
                if (removed != null) {
                    totalInputChars = Math.max(0, totalInputChars - Math.max(0, removed.estimatedInputChars));
                    totalOutputChars = Math.max(0, totalOutputChars - Math.max(0, removed.estimatedOutputChars));
                }
            }
            history.add(turn);
            totalInputChars += turn.estimatedInputChars;
            totalOutputChars += turn.estimatedOutputChars;
            lastAccessMs = System.currentTimeMillis();
        }

        public int getTotalChars() {
            return totalInputChars + totalOutputChars;
        }
    }

    public ConversationSession getOrCreateSession(String userId, String appId, String contextType) {
        String sessionKey = buildSessionKey(userId, appId, contextType, SCOPE_USER, "");
        return activeSessions.computeIfAbsent(sessionKey, k -> new ConversationSession(userId, appId, contextType));
    }

    public ConversationSession getSession(String userId, String appId, String contextType) {
        String sessionKey = buildSessionKey(userId, appId, contextType, SCOPE_USER, "");
        ConversationSession session = activeSessions.get(sessionKey);
        if (session != null) {
            session.lastAccessMs = System.currentTimeMillis();
        }
        return session;
    }

    public void recordTurn(String userId, String appId, String contextType, 
                          String userRequest, String aiResponse, Map<String, Object> metadata) {
        if (!isMeaningfulTurnText(userRequest, aiResponse)) {
            return;
        }
        ConversationSession session = getOrCreateSession(userId, appId, contextType);
        ConversationTurn turn = new ConversationTurn(userRequest, aiResponse, metadata);
        session.addTurn(turn);

        // Also persist to RocksDB if available
        if (recordManager != null) {
            try {
                persistTurnToDb(userId, appId, contextType, turn);
            } catch (Exception e) {
                // Log but don't fail - session memory is still valid
                System.err.println("Failed to persist conversation turn: " + e.getMessage());
            }
        }
    }

    public void recordTurnWithScopes(
        String userId,
        String appId,
        String contextType,
        String pName,
        Integer pType,
        String userRequest,
        String aiResponse,
        Map<String, Object> metadata
    ) {
        Map<String, Object> effectiveMetadata = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
        effectiveMetadata.putIfAbsent("pName", String.valueOf(pName == null ? "" : pName));
        effectiveMetadata.putIfAbsent("pType", pType == null ? null : pType);

        recordTurn(userId, appId, contextType, userRequest, aiResponse, effectiveMetadata);

        // App-wide shared memory: all users in same app_id can continue without restarting.
        ConversationTurn appSharedTurn = new ConversationTurn(userRequest, aiResponse, effectiveMetadata);
        getOrCreateSessionForScope("shared", appId, contextType, SCOPE_APP_SHARED, "").addTurn(appSharedTurn);

        // Code-target shared memory: all developers working same p_name + p_type can reuse context.
        String codeTargetKey = buildCodeTargetKey(pName, pType);
        if (!codeTargetKey.isBlank()) {
            ConversationTurn codeTargetTurn = new ConversationTurn(userRequest, aiResponse, effectiveMetadata);
            getOrCreateSessionForScope("shared", appId, contextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey)
                .addTurn(codeTargetTurn);
        }
    }

    public String buildAggregatedContextWindow(
        String userId,
        String appId,
        String contextType,
        String pName,
        Integer pType
    ) {
        StringBuilder out = new StringBuilder();
        int charBudget = CONTEXT_WINDOW_LIMIT;
        Set<String> seenTurnFingerprints = new HashSet<>();

        String userScope = buildContextFromSession(
            getSession(userId, appId, contextType),
            Math.max(40000, charBudget / 3),
            seenTurnFingerprints);
        if (!userScope.isBlank()) {
            out.append("## USER_MEMORY\n").append(userScope).append("\n\n");
            charBudget -= userScope.length();
        }

        ConversationSession appShared = getSessionForScope("shared", appId, contextType, SCOPE_APP_SHARED, "");
        String appScope = buildContextFromSession(appShared, Math.max(40000, charBudget / 2), seenTurnFingerprints);
        if (!appScope.isBlank() && charBudget > 0) {
            out.append("## APP_SHARED_MEMORY\n").append(appScope).append("\n\n");
            charBudget -= appScope.length();
        }

        String codeTargetKey = buildCodeTargetKey(pName, pType);
        if (!codeTargetKey.isBlank() && charBudget > 0) {
            ConversationSession codeShared = getSessionForScope(
                "shared",
                appId,
                contextType,
                SCOPE_CODE_TARGET_SHARED,
                codeTargetKey);
            String codeScope = buildContextFromSession(codeShared, Math.max(30000, charBudget), seenTurnFingerprints);
            if (!codeScope.isBlank()) {
                out.append("## CODE_TARGET_SHARED_MEMORY\n").append(codeScope).append("\n");
            }
        }

        String result = out.toString().trim();
        // Devin TF-IDF pattern: if aggregated context is large, apply extractive compression
        // to keep the highest-signal paragraphs. No LLM call needed — pure word-frequency scoring.
        if (result.length() > EXTRACTIVE_COMPRESS_THRESHOLD_CHARS) {
            result = extractiveCompress(result, EXTRACTIVE_COMPRESS_TARGET_CHARS);
        }
        return result;
    }

    public ConversationSession getSharedAppSession(String appId, String contextType) {
        return getSessionForScope("shared", appId, contextType, SCOPE_APP_SHARED, "");
    }

    public ConversationSession getSharedCodeTargetSession(String appId, String contextType, String pName, Integer pType) {
        String codeTargetKey = buildCodeTargetKey(pName, pType);
        if (codeTargetKey.isBlank()) {
            return null;
        }
        return getSessionForScope("shared", appId, contextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey);
    }

    public List<ConversationTurn> getRecentTurns(String userId, String appId, String contextType, int limit) {
        ConversationSession session = getSession(userId, appId, contextType);
        if (session == null || session.history.isEmpty()) {
            return Collections.emptyList();
        }
        int fromIndex = Math.max(0, session.history.size() - limit);
        return new ArrayList<>(session.history.subList(fromIndex, session.history.size()));
    }

    /**
     * Build optimized context window: recent turns + key extracts from older turns
     * Keeps total chars under CONTEXT_WINDOW_LIMIT for token optimization
     */
    public String buildOptimizedContextWindow(String userId, String appId, String contextType) {
        ConversationSession session = getSession(userId, appId, contextType);
        if (session == null || session.history.isEmpty()) {
            return "";
        }

        StringBuilder window = new StringBuilder();
        int charCounter = 0;

        // Add recent full turns first
        List<ConversationTurn> recentTurns = getRecentTurns(userId, appId, contextType, 5);
        for (ConversationTurn turn : recentTurns) {
            String turnStr = formatTurn(turn, true);
            if (charCounter + turnStr.length() <= CONTEXT_WINDOW_LIMIT) {
                window.append(turnStr).append("\n---\n");
                charCounter += turnStr.length() + 5;
            }
        }

        // Add summaries from older turns if space permits
        List<ConversationTurn> olderTurns = session.history.subList(0, 
            Math.max(0, session.history.size() - 5));
        for (ConversationTurn turn : olderTurns) {
            String summary = formatTurnSummary(turn);
            if (charCounter + summary.length() <= CONTEXT_WINDOW_LIMIT) {
                window.append(summary).append("\n");
                charCounter += summary.length() + 1;
            }
        }

        return window.toString();
    }

    /**
     * Get summary of all turns for quick reference (metadata only, no full content)
     */
    public String getSessionSummary(String userId, String appId, String contextType) {
        ConversationSession session = getSession(userId, appId, contextType);
        if (session == null) {
            return "No conversation history";
        }

        StringBuilder summary = new StringBuilder();
        summary.append(String.format("Session: %s (app=%s, type=%s)\n", 
            session.sessionId, session.appId, session.contextType));
        summary.append(String.format("Total turns: %d, Total chars: %d (input: %d, output: %d)\n",
            session.history.size(), session.getTotalChars(), 
            session.totalInputChars, session.totalOutputChars));
        summary.append("Recent turns:\n");

        for (int i = Math.max(0, session.history.size() - 5); i < session.history.size(); i++) {
            ConversationTurn turn = session.history.get(i);
            summary.append(String.format("  [%d] %s - Request: %d chars, Response: %d chars, Cost: %s VND\n",
                i + 1, turn.timestamp,
                turn.estimatedInputChars,
                turn.estimatedOutputChars,
                turn.metadata.getOrDefault("costVND", "?")
            ));
        }

        return summary.toString();
    }

    /**
     * Clear old sessions (unused for >1 hour) to free memory
     */
    public int cleanupOldSessions(long maxAgeMs) {
        long cutoff = System.currentTimeMillis() - maxAgeMs;
        int removed = 0;
        for (Iterator<Map.Entry<String, ConversationSession>> it = activeSessions.entrySet().iterator(); 
             it.hasNext(); ) {
            Map.Entry<String, ConversationSession> entry = it.next();
            if (entry.getValue().lastAccessMs < cutoff) {
                it.remove();
                removed++;
            }
        }
        return removed;
    }

    // ─── Private helpers ──────────────────────────────────────────

    private ConversationSession getOrCreateSessionForScope(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey
    ) {
        String sessionKey = buildSessionKey(userId, appId, contextType, scope, codeTargetKey);
        return activeSessions.computeIfAbsent(sessionKey, k -> new ConversationSession(userId, appId, contextType));
    }

    private ConversationSession getSessionForScope(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey
    ) {
        String sessionKey = buildSessionKey(userId, appId, contextType, scope, codeTargetKey);
        ConversationSession session = activeSessions.get(sessionKey);
        if (session != null) {
            session.lastAccessMs = System.currentTimeMillis();
        }
        return session;
    }

    private String buildSessionKey(String userId, String appId, String contextType, String scope, String codeTargetKey) {
        String safeUser = String.valueOf(userId == null ? "" : userId).trim();
        String safeApp = String.valueOf(appId == null ? "" : appId).trim();
        String safeType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeScope = String.valueOf(scope == null ? "" : scope).trim();
        String safeCodeKey = String.valueOf(codeTargetKey == null ? "" : codeTargetKey).trim();
        return String.format("%s:%s:%s:%s:%s", safeUser, safeApp, safeType, safeScope, safeCodeKey);
    }

    private String buildCodeTargetKey(String pName, Integer pType) {
        String n = String.valueOf(pName == null ? "" : pName).trim();
        String t = pType == null ? "" : String.valueOf(pType);
        if (n.isBlank() && t.isBlank()) {
            return "";
        }
        return (n + "::" + t)
            .toLowerCase()
            .replaceAll("[^a-z0-9_:\\-]", "_")
            .replaceAll("_+", "_");
    }

    private String buildContextFromSession(ConversationSession session, int maxChars, Set<String> seenTurnFingerprints) {
        if (session == null || session.history.isEmpty() || maxChars <= 0) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        int recentFromIndex = Math.max(0, session.history.size() - RECENT_FULL_TURNS_PER_SCOPE);
        for (int i = recentFromIndex; i < session.history.size(); i++) {
            ConversationTurn turn = session.history.get(i);
            String fingerprint = buildTurnFingerprint(turn);
            if (!fingerprint.isBlank() && seenTurnFingerprints.contains(fingerprint)) {
                continue;
            }
            String formatted = formatTurn(turn, true);
            if (out.length() + formatted.length() > maxChars) {
                break;
            }
            if (!fingerprint.isBlank()) {
                seenTurnFingerprints.add(fingerprint);
            }
            out.append(formatted).append("\n---\n");
        }

        if (out.length() < maxChars && recentFromIndex > 0) {
            int summaryFromIndex = Math.max(0, recentFromIndex - OLDER_SUMMARY_TURNS_PER_SCOPE);
            for (int i = summaryFromIndex; i < recentFromIndex; i++) {
                ConversationTurn turn = session.history.get(i);
                String fingerprint = buildTurnFingerprint(turn);
                if (!fingerprint.isBlank() && seenTurnFingerprints.contains(fingerprint)) {
                    continue;
                }
                String summary = formatTurnSummary(turn);
                if (out.length() + summary.length() + 1 > maxChars) {
                    break;
                }
                if (!fingerprint.isBlank()) {
                    seenTurnFingerprints.add(fingerprint);
                }
                out.append(summary).append("\n");
            }
        }

        return out.toString().trim();
    }

    private String formatTurn(ConversationTurn turn, boolean includeFullContent) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("### Turn [%s] %s\n", turn.turnId, turn.timestamp));
        
        if (includeFullContent) {
            sb.append(String.format("**Request:** %s\n\n", truncate(turn.userRequest, TURN_REQUEST_SNIPPET_CHARS)));
            sb.append(String.format("**Response:** %s\n\n", truncate(turn.aiResponse, TURN_RESPONSE_SNIPPET_CHARS)));
        } else {
            sb.append(String.format("Request (%d chars), Response (%d chars)\n",
                turn.estimatedInputChars, turn.estimatedOutputChars));
        }
        
        sb.append(String.format("Metadata: %s\n", compactMetadata(turn.metadata)));
        return sb.toString();
    }

    private String buildTurnFingerprint(ConversationTurn turn) {
        if (turn == null) {
            return "";
        }
        String req = normalizeTextForFingerprint(truncate(turn.userRequest, 320));
        String res = normalizeTextForFingerprint(truncate(turn.aiResponse, 480));
        if (req.isBlank() && res.isBlank()) {
            return "";
        }
        return req + "||" + res;
    }

    private String normalizeTextForFingerprint(String text) {
        return String.valueOf(text == null ? "" : text)
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase(Locale.ROOT);
    }

    private static String normalizeTurnText(String text, int maxChars) {
        String raw = String.valueOf(text == null ? "" : text)
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .replaceAll("[\\t ]+", " ")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
        if (raw.isBlank()) {
            return "";
        }
        int safeCap = Math.max(256, maxChars);
        if (raw.length() <= safeCap) {
            return raw;
        }
        return raw.substring(0, safeCap) + "...";
    }

    private static boolean isMeaningfulTurnText(String userRequest, String aiResponse) {
        String req = normalizeTurnText(userRequest, TURN_REQUEST_STORE_MAX_CHARS);
        String res = normalizeTurnText(aiResponse, TURN_RESPONSE_STORE_MAX_CHARS);
        return req.length() >= MIN_MEANINGFUL_TURN_CHARS || res.length() >= MIN_MEANINGFUL_TURN_CHARS;
    }

    private static boolean isMeaningfulTurn(ConversationTurn turn) {
        if (turn == null) {
            return false;
        }
        return isMeaningfulTurnText(turn.userRequest, turn.aiResponse);
    }

    private static boolean isNearDuplicateTurn(ConversationTurn prev, ConversationTurn next) {
        if (prev == null || next == null) {
            return false;
        }
        String prevReq = normalizeComparableText(prev.userRequest, 320);
        String nextReq = normalizeComparableText(next.userRequest, 320);
        String prevRes = normalizeComparableText(prev.aiResponse, 520);
        String nextRes = normalizeComparableText(next.aiResponse, 520);
        return prevReq.equals(nextReq) && prevRes.equals(nextRes);
    }

    private static String normalizeComparableText(String text, int cap) {
        String v = normalizeTurnText(text, Math.max(64, cap));
        v = v.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
        return v;
    }

    private Map<String, Object> compactMetadata(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, Object> compact = new LinkedHashMap<>();
        putIfPresent(compact, "source", raw.get("source"));
        putIfPresent(compact, "model", raw.get("model"));
        putIfPresent(compact, "responseMode", raw.get("responseMode"));
        putIfPresent(compact, "promptTokens", raw.get("promptTokens"));
        putIfPresent(compact, "completionTokens", raw.get("completionTokens"));
        putIfPresent(compact, "costVND", raw.get("costVND"));
        putIfPresent(compact, "pName", raw.get("pName"));
        putIfPresent(compact, "pType", raw.get("pType"));
        if (compact.isEmpty()) {
            return Collections.singletonMap("meta", truncate(String.valueOf(raw), 200));
        }
        return compact;
    }

    private void putIfPresent(Map<String, Object> out, String key, Object value) {
        if (out == null || key == null || key.isBlank() || value == null) {
            return;
        }
        if (value instanceof String s && s.trim().isEmpty()) {
            return;
        }
        out.put(key, value);
    }

    private String formatTurnSummary(ConversationTurn turn) {
        return String.format("[%s] Request: %d chars → Response: %d chars | Cost: %s VND",
            turn.timestamp,
            turn.estimatedInputChars,
            turn.estimatedOutputChars,
            turn.metadata.getOrDefault("costVND", "?")
        );
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        if (text.length() <= maxLen) return text;
        return text.substring(0, maxLen) + "...";
    }

    private void persistTurnToDb(String userId, String appId, String contextType, ConversationTurn turn) {
        // Store in RocksDB for cross-session recovery
        Map<String, Object> turnData = new LinkedHashMap<>();
        turnData.put("turn_id", turn.turnId);
        turnData.put("timestamp", turn.timestamp);
        turnData.put("user_request", turn.userRequest);
        turnData.put("ai_response", turn.aiResponse);
        turnData.put("metadata", turn.metadata);
        turnData.put("created_at_ms", turn.createdAtMs);

        if (recordManager != null) {
            try {
                // Store as: ai_conversation:userId:appId:contextType:turnId
                String objName = "ai_conversation";
                String key = String.format("%s:%s:%s:%s", userId, appId, contextType, turn.turnId);
                // recordManager.put(objName, key, turnData);
            } catch (Exception e) {
                System.err.println("Failed to persist to DB: " + e.getMessage());
            }
        }
    }

    /**
     * Extractive context compressor — ported from Devin's TF-IDF TextSummarizer.summarize_extractive().
     *
     * Pure Java implementation with no external ML dependencies.
     * Segments the text into paragraphs, scores each by normalized word-frequency (TF-inspired),
     * and selects top-scoring segments in original order to fit within maxChars.
     * OpenDevin analogy: equivalent to monologue condensation but without an LLM call.
     *
     * @param text     full aggregated context
     * @param maxChars target compressed size in chars
     * @return compressed text preserving the highest-signal paragraphs
     */
    public static String extractiveCompress(String text, int maxChars) {
        String source = String.valueOf(text == null ? "" : text).trim();
        int cap = Math.max(1000, maxChars);
        if (source.isBlank() || source.length() <= cap) {
            return source;
        }

        // 1. Split into logical segments — paragraphs first, then fall back to lines
        String[] rawSegments = source.split("\\n\\n+");
        if (rawSegments.length < 3) {
            rawSegments = source.split("\\n");
        }
        List<String> segments = new ArrayList<>();
        for (String seg : rawSegments) {
            String s = seg.trim();
            if (!s.isBlank()) {
                segments.add(s);
            }
        }
        if (segments.isEmpty()) {
            return source.substring(0, Math.min(source.length(), cap));
        }

        // 2. Build global word frequency map across all segments (TF)
        Map<String, Integer> globalWordFreq = new HashMap<>();
        for (String seg : segments) {
            for (String word : tokenizeForExtraction(seg)) {
                globalWordFreq.merge(word, 1, Integer::sum);
            }
        }

        // 3. Score each segment: sum of word TF values, normalized by sqrt(word count)
        //    to avoid bias toward very long segments
        double[] scores = new double[segments.size()];
        for (int i = 0; i < segments.size(); i++) {
            List<String> words = tokenizeForExtraction(segments.get(i));
            if (words.isEmpty()) {
                scores[i] = 0;
                continue;
            }
            double sum = 0;
            for (String word : words) {
                sum += globalWordFreq.getOrDefault(word, 0);
            }
            scores[i] = sum / Math.sqrt(Math.max(1, words.size()));
        }

        // 4. Sort segment indices by score descending, then greedily select by budget
        Integer[] indices = new Integer[segments.size()];
        for (int i = 0; i < indices.length; i++) indices[i] = i;
        Arrays.sort(indices, (a, b) -> Double.compare(scores[b], scores[a]));

        // Always keep first and last segments for structural framing
        Set<Integer> selected = new LinkedHashSet<>();
        selected.add(0);
        selected.add(segments.size() - 1);

        int budget = cap;
        for (int idx : selected) {
            budget -= segments.get(idx).length() + 4;
        }

        for (int rank = 0; rank < indices.length && budget > 0; rank++) {
            int idx = indices[rank];
            if (selected.contains(idx)) continue;
            String seg = segments.get(idx);
            if (budget - seg.length() - 4 < 0) continue;
            selected.add(idx);
            budget -= seg.length() + 4;
        }

        // 5. Rebuild in original order with gap markers
        List<Integer> orderedSelected = new ArrayList<>(selected);
        Collections.sort(orderedSelected);
        StringBuilder result = new StringBuilder();
        int lastIdx = -1;
        for (int idx : orderedSelected) {
            if (lastIdx >= 0 && idx > lastIdx + 1) {
                result.append("\n...\n");
            }
            if (result.length() > 0) {
                result.append("\n\n");
            }
            result.append(segments.get(idx));
            lastIdx = idx;
        }
        return result.toString();
    }

    private static List<String> tokenizeForExtraction(String text) {
        if (text == null || text.isBlank()) return Collections.emptyList();
        String[] tokens = text.toLowerCase(Locale.ROOT).split("[\\s\\p{Punct}]+");
        List<String> result = new ArrayList<>();
        Set<String> stopWords = Set.of(
            "the", "and", "or", "in", "on", "at", "to", "a", "an", "is", "was",
            "are", "were", "be", "been", "it", "its", "this", "that", "of", "for",
            "with", "as", "by", "from", "có", "của", "được", "trong", "là", "một", "và"
        );
        for (String t : tokens) {
            if (t.length() >= 3 && !stopWords.contains(t)) {
                result.add(t);
            }
        }
        return result;
    }
}
