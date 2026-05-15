package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
    private static final String SCOPE_USER = "user";
    private static final String SCOPE_APP_SHARED = "app_shared";
    private static final String SCOPE_CODE_TARGET_SHARED = "code_target_shared";
    private static final String CONVERSATION_TABLE = "ai_conversation_history";
    // Devin TF-IDF-inspired extractive compressor: if aggregated context exceeds this threshold,
    // apply sentence-level extraction (no LLM needed) to keep only high-signal content.
    private static final int EXTRACTIVE_COMPRESS_THRESHOLD_CHARS = 50_000;
    private static final int EXTRACTIVE_COMPRESS_TARGET_CHARS = 30_000;

    @Value("${ai.conversation.context.recent-full-turns-per-scope:3}")
    private int recentFullTurnsPerScope;

    @Value("${ai.conversation.context.older-summary-turns-per-scope:6}")
    private int olderSummaryTurnsPerScope;

    @Value("${ai.conversation.context.optimized-window-recent-turns:3}")
    private int optimizedWindowRecentTurns;

    @Value("${ai.conversation.context.summary-recent-turns:3}")
    private int summaryRecentTurns;

    public class ConversationTurn {
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

    public class ConversationSession {
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
        return activeSessions.computeIfAbsent(sessionKey,
            k -> loadSessionFromDb(userId, appId, contextType, SCOPE_USER, "", null, null, true));
    }

    public ConversationSession getSession(String userId, String appId, String contextType) {
        String sessionKey = buildSessionKey(userId, appId, contextType, SCOPE_USER, "");
        ConversationSession session = activeSessions.get(sessionKey);
        if (session == null) {
            session = loadSessionFromDb(userId, appId, contextType, SCOPE_USER, "", null, null, false);
            if (session != null) {
                activeSessions.put(sessionKey, session);
            }
        }
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
        persistTurnToDb("shared", appId, contextType, SCOPE_APP_SHARED, "", null, null, appSharedTurn);

        // Code-target shared memory: all developers working same p_name + p_type can reuse context.
        String codeTargetKey = buildCodeTargetKey(pName, pType);
        if (!codeTargetKey.isBlank()) {
            ConversationTurn codeTargetTurn = new ConversationTurn(userRequest, aiResponse, effectiveMetadata);
            getOrCreateSessionForScope("shared", appId, contextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey)
                .addTurn(codeTargetTurn);
            persistTurnToDb("shared", appId, contextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey, pName, pType, codeTargetTurn);
        }
    }

    public Map<String, Object> updateAgenticApprovalState(
        String userId,
        String appId,
        String contextType,
        String pName,
        Integer pType,
        String requestId,
        int stepIndex,
        String action
    ) {
        String safeUserId = String.valueOf(userId == null ? "" : userId).trim();
        String safeAppId = String.valueOf(appId == null ? "" : appId).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeRequestId = String.valueOf(requestId == null ? "" : requestId).trim();
        String safeAction = String.valueOf(action == null ? "" : action).trim().toLowerCase(Locale.ROOT);
        String codeTargetKey = buildCodeTargetKey(pName, pType);
        if (safeUserId.isBlank() || safeAppId.isBlank() || safeContextType.isBlank() || safeRequestId.isBlank() || safeAction.isBlank()) {
            return Map.of("updated", false, "message", "invalid_input");
        }

        boolean updated = false;
        int pendingCount = 0;

        Map<String, Object> userResult = updateAgenticApprovalScope(safeUserId, safeAppId, safeContextType, SCOPE_USER, "", safeRequestId, stepIndex, safeAction);
        updated = updated || Boolean.TRUE.equals(userResult.get("updated"));
        pendingCount = Math.max(pendingCount, toSafeInt(userResult.get("pendingCount")));

        Map<String, Object> appSharedResult = updateAgenticApprovalScope("shared", safeAppId, safeContextType, SCOPE_APP_SHARED, "", safeRequestId, stepIndex, safeAction);
        updated = updated || Boolean.TRUE.equals(appSharedResult.get("updated"));
        pendingCount = Math.max(pendingCount, toSafeInt(appSharedResult.get("pendingCount")));

        if (!codeTargetKey.isBlank()) {
            Map<String, Object> codeSharedResult = updateAgenticApprovalScope("shared", safeAppId, safeContextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey, safeRequestId, stepIndex, safeAction);
            updated = updated || Boolean.TRUE.equals(codeSharedResult.get("updated"));
            pendingCount = Math.max(pendingCount, toSafeInt(codeSharedResult.get("pendingCount")));
        }

        return Map.of(
            "updated", updated,
            "pendingCount", Math.max(0, pendingCount),
            "status", pendingCount > 0 ? "review_required" : "completed"
        );
    }

    public Map<String, Object> getAgenticReviewState(
        String userId,
        String appId,
        String contextType,
        String pName,
        Integer pType,
        String requestId
    ) {
        String safeUserId = String.valueOf(userId == null ? "" : userId).trim();
        String safeAppId = String.valueOf(appId == null ? "" : appId).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeRequestId = String.valueOf(requestId == null ? "" : requestId).trim();
        if (safeUserId.isBlank() || safeAppId.isBlank() || safeContextType.isBlank() || safeRequestId.isBlank()) {
            return Map.of("found", false, "message", "invalid_input");
        }

        String codeTargetKey = buildCodeTargetKey(pName, pType);
        List<Map<String, Object>> searchScopes = new ArrayList<>();
        if (!codeTargetKey.isBlank()) {
            searchScopes.add(Map.of(
                "userId", "shared",
                "scope", SCOPE_CODE_TARGET_SHARED,
                "codeTargetKey", codeTargetKey,
                "persistence", false
            ));
        }
        searchScopes.add(Map.of(
            "userId", safeUserId,
            "scope", SCOPE_USER,
            "codeTargetKey", "",
            "persistence", false
        ));
        searchScopes.add(Map.of(
            "userId", "shared",
            "scope", SCOPE_APP_SHARED,
            "codeTargetKey", "",
            "persistence", false
        ));
        if (!codeTargetKey.isBlank()) {
            searchScopes.add(Map.of(
                "userId", "shared",
                "scope", SCOPE_CODE_TARGET_SHARED,
                "codeTargetKey", codeTargetKey,
                "persistence", true
            ));
        }
        searchScopes.add(Map.of(
            "userId", safeUserId,
            "scope", SCOPE_USER,
            "codeTargetKey", "",
            "persistence", true
        ));
        searchScopes.add(Map.of(
            "userId", "shared",
            "scope", SCOPE_APP_SHARED,
            "codeTargetKey", "",
            "persistence", true
        ));

        for (Map<String, Object> searchScope : searchScopes) {
            String scopeUserId = String.valueOf(searchScope.getOrDefault("userId", "")).trim();
            String scope = String.valueOf(searchScope.getOrDefault("scope", "")).trim();
            String scopeCodeTargetKey = String.valueOf(searchScope.getOrDefault("codeTargetKey", "")).trim();
            boolean persistence = Boolean.TRUE.equals(searchScope.get("persistence"));
            ConversationSession session = persistence
                ? loadSessionFromPersistence(scopeUserId, safeAppId, safeContextType, scope, scopeCodeTargetKey, pName, pType)
                : getSessionForScope(scopeUserId, safeAppId, safeContextType, scope, scopeCodeTargetKey);
            Map<String, Object> state = findAgenticReviewStateInSession(session, safeRequestId, scope, persistence);
            if (Boolean.TRUE.equals(state.get("found"))) {
                return state;
            }
        }

        return Map.of(
            "found", false,
            "requestId", safeRequestId,
            "status", "completed",
            "pendingCount", 0,
            "reviewRequired", false,
            "agenticPendingApprovalSteps", List.of()
        );
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
        int recentLimit = Math.max(2, optimizedWindowRecentTurns);
        List<ConversationTurn> recentTurns = getRecentTurns(userId, appId, contextType, recentLimit);
        for (ConversationTurn turn : recentTurns) {
            String turnStr = formatTurn(turn, true);
            if (charCounter + turnStr.length() <= CONTEXT_WINDOW_LIMIT) {
                window.append(turnStr).append("\n---\n");
                charCounter += turnStr.length() + 5;
            }
        }

        // Add summaries from older turns if space permits
        int olderTurnsStart = Math.max(0, session.history.size() - recentLimit);
        List<ConversationTurn> olderTurns = session.history.subList(0, 
            olderTurnsStart);
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

        int recentSummaryLimit = Math.max(2, summaryRecentTurns);
        for (int i = Math.max(0, session.history.size() - recentSummaryLimit); i < session.history.size(); i++) {
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

    /**
     * Clear in-memory conversation sessions for user/app/context and related shared scopes.
     * This is used by UI "delete session" actions to avoid reusing stale context.
     */
    public int clearAssistantSessions(String userId, String appId, String contextType, String pName, Integer pType) {
        String safeUserId = String.valueOf(userId == null ? "" : userId).trim();
        String safeAppId = String.valueOf(appId == null ? "" : appId).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        String codeTargetKey = buildCodeTargetKey(pName, pType);

        if (safeAppId.isEmpty() || safeContextType.isEmpty()) {
            return 0;
        }

        int removed = 0;

        if (!safeUserId.isEmpty()) {
            String userScopeKey = buildSessionKey(safeUserId, safeAppId, safeContextType, SCOPE_USER, "");
            if (activeSessions.remove(userScopeKey) != null) {
                removed++;
            }
        }

        String appSharedKey = buildSessionKey("shared", safeAppId, safeContextType, SCOPE_APP_SHARED, "");
        if (activeSessions.remove(appSharedKey) != null) {
            removed++;
        }

        if (!codeTargetKey.isEmpty()) {
            String codeSharedKey = buildSessionKey("shared", safeAppId, safeContextType, SCOPE_CODE_TARGET_SHARED, codeTargetKey);
            if (activeSessions.remove(codeSharedKey) != null) {
                removed++;
            }
        }

        return removed;
    }

    public int deleteAssistantPersistedTurns(
        String userId,
        String appId,
        String contextType,
        String pName,
        Integer pType,
        String turnId,
        boolean deleteAll
    ) {
        if (recordManager == null) {
            return 0;
        }

        String safeUserId = String.valueOf(userId == null ? "" : userId).trim();
        String safeAppId = String.valueOf(appId == null ? "" : appId).trim();
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeTurnId = String.valueOf(turnId == null ? "" : turnId).trim();
        String codeTargetKey = buildCodeTargetKey(pName, pType);

        if (safeAppId.isEmpty() || safeContextType.isEmpty() || (!deleteAll && safeTurnId.isEmpty())) {
            return 0;
        }

        int deleted = 0;
        try {
            Map<String, Object> result = recordManager.filter(safeAppId, CONVERSATION_TABLE, null);
            Object rowsObj = result == null ? null : result.get("rows");
            if (!(rowsObj instanceof List<?> rows)) {
                return 0;
            }

            for (Object rowObj : rows) {
                if (!(rowObj instanceof Map<?, ?> rawMap)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> row = (Map<String, Object>) rawMap;
                if (!matchesAssistantDeletionTarget(row, safeUserId, safeAppId, safeContextType, codeTargetKey, safeTurnId, deleteAll)) {
                    continue;
                }
                try {
                    recordManager.deleteRecord(safeAppId, CONVERSATION_TABLE, row);
                    deleted++;
                } catch (Exception ignored) {
                    // Best-effort delete so one bad row does not block the rest.
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to delete persisted assistant turns: " + e.getMessage());
        }
        return deleted;
    }
    // ─── Private helpers ──────────────────────────────────────────

    private boolean matchesAssistantDeletionTarget(
        Map<String, Object> row,
        String userId,
        String appId,
        String contextType,
        String codeTargetKey,
        String turnId,
        boolean deleteAll
    ) {
        if (row == null) {
            return false;
        }

        String persistedAppId = String.valueOf(row.getOrDefault("app_id", "")).trim();
        String persistedContextType = String.valueOf(row.getOrDefault("context_type", "")).trim();
        String persistedScope = String.valueOf(row.getOrDefault("scope", SCOPE_USER)).trim();
        String persistedTurnId = String.valueOf(row.getOrDefault("turn_id", "")).trim();
        String persistedUserId = String.valueOf(row.getOrDefault("user_id", "")).trim();
        String persistedCodeTargetKey = String.valueOf(row.getOrDefault("code_target_key", "")).trim();

        if (!appId.equals(persistedAppId) || !contextType.equals(persistedContextType)) {
            return false;
        }
        if (!deleteAll && !turnId.equals(persistedTurnId)) {
            return false;
        }

        if (SCOPE_USER.equals(persistedScope)) {
            return !userId.isEmpty() && userId.equals(persistedUserId);
        }
        if (SCOPE_APP_SHARED.equals(persistedScope)) {
            return deleteAll || !turnId.isEmpty();
        }
        if (SCOPE_CODE_TARGET_SHARED.equals(persistedScope)) {
            return !codeTargetKey.isEmpty() && codeTargetKey.equals(persistedCodeTargetKey);
        }
        return false;
    }

    private ConversationSession getOrCreateSessionForScope(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey
    ) {
        String sessionKey = buildSessionKey(userId, appId, contextType, scope, codeTargetKey);
        return activeSessions.computeIfAbsent(sessionKey,
            k -> loadSessionFromDb(userId, appId, contextType, scope, codeTargetKey, null, null, true));
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
        if (session == null) {
            session = loadSessionFromDb(userId, appId, contextType, scope, codeTargetKey, null, null, false);
            if (session != null) {
                activeSessions.put(sessionKey, session);
            }
        }
        if (session != null) {
            session.lastAccessMs = System.currentTimeMillis();
        }
        return session;
    }

    public ConversationSession loadSessionFromPersistence(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey,
        String pName,
        Integer pType
    ) {
        return loadSessionFromDb(userId, appId, contextType, scope, codeTargetKey, pName, pType, false);
    }

    private String buildSessionKey(String userId, String appId, String contextType, String scope, String codeTargetKey) {
        String safeUser = String.valueOf(userId == null ? "" : userId).trim();
        String safeApp = String.valueOf(appId == null ? "" : appId).trim();
        String safeType = String.valueOf(contextType == null ? "" : contextType).trim();
        String safeScope = String.valueOf(scope == null ? "" : scope).trim();
        String safeCodeKey = String.valueOf(codeTargetKey == null ? "" : codeTargetKey).trim();
        return String.format("%s:%s:%s:%s:%s", safeUser, safeApp, safeType, safeScope, safeCodeKey);
    }

    private Map<String, Object> updateAgenticApprovalScope(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey,
        String requestId,
        int stepIndex,
        String action
    ) {
        boolean updated = false;
        int pendingCount = 0;

        String sessionKey = buildSessionKey(userId, appId, contextType, scope, codeTargetKey);
        ConversationSession active = activeSessions.get(sessionKey);
        if (active != null) {
            Map<String, Object> inMemoryResult = updateAgenticApprovalInSession(active, requestId, stepIndex, action);
            updated = updated || Boolean.TRUE.equals(inMemoryResult.get("updated"));
            pendingCount = Math.max(pendingCount, toSafeInt(inMemoryResult.get("pendingCount")));
        }

        if (recordManager != null) {
            try {
                Map<String, Object> result = recordManager.filter(appId, CONVERSATION_TABLE, null);
                Object rowsObj = result == null ? null : result.get("rows");
                if (rowsObj instanceof List<?> rows) {
                    List<Map<String, Object>> updates = new ArrayList<>();
                    for (Object rowObj : rows) {
                        if (!(rowObj instanceof Map<?, ?> rawMap)) {
                            continue;
                        }
                        @SuppressWarnings("unchecked")
                        Map<String, Object> row = new LinkedHashMap<>((Map<String, Object>) rawMap);
                        if (!matchesPersistedTurn(row, userId, appId, contextType, scope, codeTargetKey, null, null)) {
                            continue;
                        }
                        Object metadataObj = row.get("metadata");
                        if (!(metadataObj instanceof Map<?, ?> metadataMap)) {
                            continue;
                        }
                        Map<String, Object> metadata = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : metadataMap.entrySet()) {
                            if (entry.getKey() instanceof String key) {
                                metadata.put(key, entry.getValue());
                            }
                        }
                        if (!requestId.equals(String.valueOf(metadata.getOrDefault("requestId", "")).trim())) {
                            continue;
                        }
                        Map<String, Object> metaUpdate = applyAgenticApprovalUpdate(metadata, stepIndex, action);
                        if (!Boolean.TRUE.equals(metaUpdate.get("updated"))) {
                            continue;
                        }
                        row.put("metadata", metadata);
                        updates.add(row);
                        updated = true;
                        pendingCount = Math.max(pendingCount, toSafeInt(metaUpdate.get("pendingCount")));
                    }
                    if (!updates.isEmpty()) {
                        recordManager.batchUpdateRecords(appId, CONVERSATION_TABLE, updates, List.of("id"));
                    }
                }
            }
            catch (Exception ignored) {
                // Best-effort persistence update only.
            }
        }

        return Map.of("updated", updated, "pendingCount", pendingCount);
    }

    private Map<String, Object> findAgenticReviewStateInSession(
        ConversationSession session,
        String requestId,
        String scope,
        boolean fromPersistence
    ) {
        if (session == null || session.history == null || session.history.isEmpty()) {
            return Map.of("found", false);
        }
        for (int i = session.history.size() - 1; i >= 0; i--) {
            ConversationTurn turn = session.history.get(i);
            if (turn == null || turn.metadata == null) {
                continue;
            }
            if (!requestId.equals(String.valueOf(turn.metadata.getOrDefault("requestId", "")).trim())) {
                continue;
            }
            return buildAgenticReviewStatePayload(turn, requestId, scope, fromPersistence);
        }
        return Map.of("found", false);
    }

    private Map<String, Object> updateAgenticApprovalInSession(ConversationSession session, String requestId, int stepIndex, String action) {
        if (session == null || session.history == null || session.history.isEmpty()) {
            return Map.of("updated", false, "pendingCount", 0);
        }
        boolean updated = false;
        int pendingCount = 0;
        for (int i = session.history.size() - 1; i >= 0; i--) {
            ConversationTurn turn = session.history.get(i);
            if (turn == null || turn.metadata == null) {
                continue;
            }
            if (!requestId.equals(String.valueOf(turn.metadata.getOrDefault("requestId", "")).trim())) {
                continue;
            }
            Map<String, Object> result = applyAgenticApprovalUpdate(turn.metadata, stepIndex, action);
            updated = updated || Boolean.TRUE.equals(result.get("updated"));
            pendingCount = Math.max(pendingCount, toSafeInt(result.get("pendingCount")));
            break;
        }
        return Map.of("updated", updated, "pendingCount", pendingCount);
    }

    private Map<String, Object> applyAgenticApprovalUpdate(Map<String, Object> metadata, int stepIndex, String action) {
        if (metadata == null) {
            return Map.of("updated", false, "pendingCount", 0);
        }
        Object rawSteps = metadata.get("agenticPendingApprovalSteps");
        if (!(rawSteps instanceof List<?> rawList) || rawList.isEmpty()) {
            return Map.of("updated", false, "pendingCount", 0);
        }

        boolean updated = false;
        List<Map<String, Object>> normalizedSteps = new ArrayList<>();
        for (Object item : rawList) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> step = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() instanceof String key) {
                    step.put(key, entry.getValue());
                }
            }
            int currentStepIndex = toSafeInt(step.get("stepIndex"));
            if (("approved".equals(action) || "rejected".equals(action)) && currentStepIndex == Math.max(1, stepIndex)) {
                step.put("approvalState", action);
                step.put("status", "done");
                step.put("timestamp", System.currentTimeMillis());
                updated = true;
            }
            normalizedSteps.add(step);
        }

        int pendingCount = 0;
        for (Map<String, Object> step : normalizedSteps) {
            String state = String.valueOf(step.getOrDefault("approvalState", "pending")).trim().toLowerCase(Locale.ROOT);
            if ("pending".equals(state)) {
                pendingCount += 1;
            }
        }

        if ("resolved".equals(action)) {
            metadata.put("reviewResolvedAt", System.currentTimeMillis());
            updated = true;
        }

        metadata.put("agenticPendingApprovalSteps", normalizedSteps);
        metadata.put("agenticStepApprovalPendingCount", Math.max(0, pendingCount));
        metadata.put("reviewRequired", pendingCount > 0);
        metadata.put("status", pendingCount > 0 ? "review_required" : "completed");
        return Map.of("updated", updated, "pendingCount", pendingCount);
    }

    private Map<String, Object> buildAgenticReviewStatePayload(
        ConversationTurn turn,
        String requestId,
        String scope,
        boolean fromPersistence
    ) {
        Map<String, Object> metadata = turn.metadata != null ? new LinkedHashMap<>(turn.metadata) : new LinkedHashMap<>();
        List<Map<String, Object>> normalizedSteps = new ArrayList<>();
        Object rawSteps = metadata.get("agenticPendingApprovalSteps");
        if (rawSteps instanceof List<?> stepList) {
            for (Object item : stepList) {
                if (!(item instanceof Map<?, ?> rawMap)) {
                    continue;
                }
                Map<String, Object> step = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    if (entry.getKey() instanceof String key) {
                        step.put(key, entry.getValue());
                    }
                }
                normalizedSteps.add(step);
            }
        }
        int pendingCount = toSafeInt(metadata.get("agenticStepApprovalPendingCount"));
        if (pendingCount <= 0 && !normalizedSteps.isEmpty()) {
            for (Map<String, Object> step : normalizedSteps) {
                String approvalState = String.valueOf(step.getOrDefault("approvalState", "pending")).trim().toLowerCase(Locale.ROOT);
                if ("pending".equals(approvalState)) {
                    pendingCount += 1;
                }
            }
        }
        String status = String.valueOf(metadata.getOrDefault("status", pendingCount > 0 ? "review_required" : "completed"))
            .trim()
            .toLowerCase(Locale.ROOT);
        boolean reviewRequired = metadata.get("reviewRequired") instanceof Boolean bool
            ? bool
            : pendingCount > 0 || "review_required".equals(status);
        return Map.of(
            "found", true,
            "requestId", requestId,
            "turnId", String.valueOf(turn.turnId == null ? "" : turn.turnId),
            "timestamp", String.valueOf(turn.timestamp == null ? "" : turn.timestamp),
            "scope", String.valueOf(scope == null ? "" : scope),
            "fromPersistence", fromPersistence,
            "status", status.isBlank() ? (reviewRequired ? "review_required" : "completed") : status,
            "reviewRequired", reviewRequired,
            "pendingCount", Math.max(0, pendingCount),
            "agenticPendingApprovalSteps", normalizedSteps
        );
    }

    private int toSafeInt(Object value) {
        if (value instanceof Number number) {
            return Math.max(0, number.intValue());
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(value == null ? "0" : value).trim()));
        }
        catch (Exception ignored) {
            return 0;
        }
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
        int recentTurns = Math.max(2, recentFullTurnsPerScope);
        int olderSummaryTurns = Math.max(2, olderSummaryTurnsPerScope);
        int recentFromIndex = Math.max(0, session.history.size() - recentTurns);
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
            int summaryFromIndex = Math.max(0, recentFromIndex - olderSummaryTurns);
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
        persistTurnToDb(userId, appId, contextType, SCOPE_USER, "", null, null, turn);
    }

    private void persistTurnToDb(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey,
        String pName,
        Integer pType,
        ConversationTurn turn
    ) {
        // Store in RocksDB for cross-session recovery
        Map<String, Object> turnData = new LinkedHashMap<>();
        turnData.put("id", buildPersistedTurnId(turn.turnId, scope, codeTargetKey));
        turnData.put("turn_id", turn.turnId);
        turnData.put("user_id", String.valueOf(userId == null ? "" : userId).trim());
        turnData.put("app_id", String.valueOf(appId == null ? "" : appId).trim());
        turnData.put("context_type", String.valueOf(contextType == null ? "" : contextType).trim());
        turnData.put("scope", String.valueOf(scope == null ? SCOPE_USER : scope).trim());
        turnData.put("code_target_key", String.valueOf(codeTargetKey == null ? "" : codeTargetKey).trim());
        turnData.put("p_name", String.valueOf(pName == null ? "" : pName).trim());
        turnData.put("p_type", pType);
        turnData.put("timestamp", turn.timestamp);
        turnData.put("user_request", turn.userRequest);
        turnData.put("ai_response", turn.aiResponse);
        turnData.put("metadata", turn.metadata);
        turnData.put("created_at_ms", turn.createdAtMs);

        if (recordManager != null) {
            try {
                @SuppressWarnings("unchecked")
                List<String>[] primaryKeyOverride = new List[]{List.of("id")};
                recordManager.createRecord(appId, CONVERSATION_TABLE, turnData, primaryKeyOverride);
            } catch (Exception e) {
                System.err.println("Failed to persist to DB: " + e.getMessage());
            }
        }
    }

    private ConversationSession loadSessionFromDb(
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey,
        String pName,
        Integer pType,
        boolean createIfMissing
    ) {
        ConversationSession session = new ConversationSession(userId, appId, contextType);
        if (recordManager == null) {
            return createIfMissing ? session : null;
        }
        try {
            Map<String, Object> result = recordManager.filter(appId, CONVERSATION_TABLE, null);
            Object rowsObj = result == null ? null : result.get("rows");
            if (rowsObj instanceof List<?> rows) {
                List<Map<String, Object>> matchedRows = new ArrayList<>();
                for (Object rowObj : rows) {
                    if (!(rowObj instanceof Map<?, ?> rawMap)) {
                        continue;
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> row = (Map<String, Object>) rawMap;
                    if (matchesPersistedTurn(row, userId, appId, contextType, scope, codeTargetKey, pName, pType)) {
                        matchedRows.add(row);
                    }
                }
                matchedRows.sort(Comparator.comparingLong(this::readCreatedAtMs));
                for (Map<String, Object> row : matchedRows) {
                    ConversationTurn turn = toConversationTurn(row);
                    if (turn != null) {
                        session.addTurn(turn);
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to load session from DB: " + e.getMessage());
        }
        if (!session.history.isEmpty()) {
            session.lastAccessMs = System.currentTimeMillis();
            return session;
        }
        return createIfMissing ? session : null;
    }

    private boolean matchesPersistedTurn(
        Map<String, Object> row,
        String userId,
        String appId,
        String contextType,
        String scope,
        String codeTargetKey,
        String pName,
        Integer pType
    ) {
        String persistedAppId = String.valueOf(row.getOrDefault("app_id", "")).trim();
        String persistedContextType = String.valueOf(row.getOrDefault("context_type", "")).trim();
        String persistedScope = String.valueOf(row.getOrDefault("scope", SCOPE_USER)).trim();
        if (!String.valueOf(appId == null ? "" : appId).trim().equals(persistedAppId)) {
            return false;
        }
        if (!String.valueOf(contextType == null ? "" : contextType).trim().equals(persistedContextType)) {
            return false;
        }
        if (!String.valueOf(scope == null ? SCOPE_USER : scope).trim().equals(persistedScope)) {
            return false;
        }

        if (SCOPE_USER.equals(persistedScope)) {
            return String.valueOf(userId == null ? "" : userId).trim()
                .equals(String.valueOf(row.getOrDefault("user_id", "")).trim());
        }

        if (SCOPE_CODE_TARGET_SHARED.equals(persistedScope)) {
            String effectiveCodeTargetKey = !String.valueOf(codeTargetKey == null ? "" : codeTargetKey).trim().isBlank()
                ? String.valueOf(codeTargetKey).trim()
                : buildCodeTargetKey(pName, pType);
            return effectiveCodeTargetKey.equals(String.valueOf(row.getOrDefault("code_target_key", "")).trim());
        }

        return SCOPE_APP_SHARED.equals(persistedScope);
    }

    private ConversationTurn toConversationTurn(Map<String, Object> row) {
        if (row == null) {
            return null;
        }
        String userRequest = normalizeTurnText(String.valueOf(row.getOrDefault("user_request", "")), TURN_REQUEST_STORE_MAX_CHARS);
        String aiResponse = normalizeTurnText(String.valueOf(row.getOrDefault("ai_response", "")), TURN_RESPONSE_STORE_MAX_CHARS);
        if (!isMeaningfulTurnText(userRequest, aiResponse)) {
            return null;
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        Object metadataObj = row.get("metadata");
        if (metadataObj instanceof Map<?, ?> metadataMap) {
            for (Map.Entry<?, ?> entry : metadataMap.entrySet()) {
                if (entry.getKey() instanceof String key) {
                    metadata.put(key, entry.getValue());
                }
            }
        }
        ConversationTurn turn = new ConversationTurn(userRequest, aiResponse, metadata);
        String turnId = String.valueOf(row.getOrDefault("turn_id", "")).trim();
        if (!turnId.isBlank()) {
            turn.turnId = turnId;
        }
        String timestamp = String.valueOf(row.getOrDefault("timestamp", "")).trim();
        if (!timestamp.isBlank()) {
            turn.timestamp = timestamp;
        }
        turn.createdAtMs = readCreatedAtMs(row);
        turn.estimatedInputChars = userRequest.length();
        turn.estimatedOutputChars = aiResponse.length();
        return turn;
    }

    private long readCreatedAtMs(Map<String, Object> row) {
        Object raw = row == null ? null : row.get("created_at_ms");
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw == null ? "0" : raw).trim());
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private String buildPersistedTurnId(String turnId, String scope, String codeTargetKey) {
        String safeTurnId = String.valueOf(turnId == null ? "" : turnId).trim();
        String safeScope = String.valueOf(scope == null ? SCOPE_USER : scope).trim();
        String safeCodeKey = String.valueOf(codeTargetKey == null ? "" : codeTargetKey).trim();
        if (safeCodeKey.isBlank()) {
            return safeTurnId + "::" + safeScope;
        }
        return safeTurnId + "::" + safeScope + "::" + safeCodeKey;
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
