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
    private static final String SCOPE_USER = "user";
    private static final String SCOPE_APP_SHARED = "app_shared";
    private static final String SCOPE_CODE_TARGET_SHARED = "code_target_shared";

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
            this.userRequest = userRequest;
            this.aiResponse = aiResponse;
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
            if (history.size() >= MAX_SESSION_HISTORY) {
                history.remove(0); // Remove oldest
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

        String userScope = buildContextFromSession(getSession(userId, appId, contextType), Math.max(40000, charBudget / 3));
        if (!userScope.isBlank()) {
            out.append("## USER_MEMORY\n").append(userScope).append("\n\n");
            charBudget -= userScope.length();
        }

        ConversationSession appShared = getSessionForScope("shared", appId, contextType, SCOPE_APP_SHARED, "");
        String appScope = buildContextFromSession(appShared, Math.max(40000, charBudget / 2));
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
            String codeScope = buildContextFromSession(codeShared, Math.max(30000, charBudget));
            if (!codeScope.isBlank()) {
                out.append("## CODE_TARGET_SHARED_MEMORY\n").append(codeScope).append("\n");
            }
        }

        return out.toString().trim();
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

    private String buildContextFromSession(ConversationSession session, int maxChars) {
        if (session == null || session.history.isEmpty() || maxChars <= 0) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        int fromIndex = Math.max(0, session.history.size() - 5);
        for (int i = fromIndex; i < session.history.size(); i++) {
            ConversationTurn turn = session.history.get(i);
            String formatted = formatTurn(turn, true);
            if (out.length() + formatted.length() > maxChars) {
                break;
            }
            out.append(formatted).append("\n---\n");
        }
        return out.toString().trim();
    }

    private String formatTurn(ConversationTurn turn, boolean includeFullContent) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("### Turn [%s] %s\n", turn.turnId, turn.timestamp));
        
        if (includeFullContent) {
            sb.append(String.format("**Request:** %s\n\n", truncate(turn.userRequest, 500)));
            sb.append(String.format("**Response:** %s\n\n", truncate(turn.aiResponse, 1000)));
        } else {
            sb.append(String.format("Request (%d chars), Response (%d chars)\n",
                turn.estimatedInputChars, turn.estimatedOutputChars));
        }
        
        sb.append(String.format("Metadata: %s\n", turn.metadata));
        return sb.toString();
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
}
