package net.phanmemmottrieu.data;

import net.phanmemmottrieu.model.ChatMessage;
import net.phanmemmottrieu.service.ChatPersistenceService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Chat History Manager - Wrapper around ChatPersistenceService
 * Giữ API tương thích với code cũ nhưng sử dụng persistence service bên dưới
 */
@Component
public class ChatHistoryManager {
    
    private static ChatPersistenceService persistenceService;
    
    // Static initializer sẽ được gọi bởi Spring
    public ChatHistoryManager(ChatPersistenceService service) {
        ChatHistoryManager.persistenceService = service;
    }
    
    public static void saveMessage(ChatMessage message) {
        // 🔥 CRITICAL: Ensure appId is derived from room if missing so data is stored in the correct app database
        if (message != null && (message.getAppId() == null || message.getAppId().isBlank())) {
            String inferredAppId = inferAppIdFromRoom(message.getRoom());
            message.setAppId(inferredAppId);
            org.slf4j.LoggerFactory.getLogger(ChatHistoryManager.class)
                .info("📍 [ChatHistoryManager] Inferred appId from room: {} → {}", message.getRoom(), inferredAppId);
        }
        if (persistenceService != null) {
            persistenceService.saveMessage(message);
        }
    }

    public static List<ChatMessage> getHistory(String room, int limit) {
        return getHistory(inferAppIdFromRoom(room), room, limit);
    }

    public static List<ChatMessage> getHistory(String appId, String room, int limit) {
        if (persistenceService != null) {
            return persistenceService.getHistory(appId, room, limit);
        }
        return new ArrayList<>();
    }

    public static List<ChatMessage> getHistoryByAppId(String appId, int limit) {
        if (persistenceService != null) {
            return persistenceService.getHistoryByAppId(appId, limit);
        }
        return new ArrayList<>();
    }

    public static List<ChatMessage> getHistoryByGuestPhone(String appId, String guestPhone, int limit) {
        if (persistenceService != null) {
            return persistenceService.getHistoryByGuestPhone(appId, guestPhone, limit);
        }
        return new ArrayList<>();
    }

    public static List<String> getGuestPhonesByAppId(String appId) {
        if (persistenceService != null) {
            return persistenceService.getGuestPhonesByAppId(appId);
        }
        return new ArrayList<>();
    }

    public static void markAllAsRead(String room, String userId) {
        if (persistenceService != null) {
            persistenceService.markAllAsRead(room, userId);
        }
    }

    public static void markAllAsReadByGuestPhone(String appId, String guestPhone) {
        if (persistenceService != null) {
            persistenceService.markAllAsReadByGuestPhone(appId, guestPhone);
        }
    }

    public static void markMessageAsRead(int messageIndex, String userId) {
        // Deprecated - không còn sử dụng message index
        // Sử dụng markAllAsRead thay thế
    }

    private static String inferAppIdFromRoom(String room) {
        if (room == null || room.isBlank()) {
            return "csm";
        }

        String normalized = room.trim();
        int colonIdx = normalized.indexOf(':');
        if (colonIdx >= 0 && colonIdx < normalized.length() - 1) {
            normalized = normalized.substring(colonIdx + 1);
        }

        int semicolonIdx = normalized.indexOf(';');
        if (semicolonIdx > 0) {
            normalized = normalized.substring(0, semicolonIdx);
        }

        // Avoid treating phone numbers as appId
        if (normalized.matches("[+]?\\d[\\d\\s-]{7,}")) {
            return "csm";
        }

        return normalized.isBlank() ? "csm" : normalized;
    }
}
