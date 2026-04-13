package net.phanmemmottrieu.data;

import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ChatRoomManager {
    private static final Logger logger = LoggerFactory.getLogger(ChatRoomManager.class);
    
    // Map<appId, Map<roomId, Set<userId>>>
    private static final Map<String, Map<String, Set<String>>> appRooms = new HashMap<>();

    // Tạo phòng chat (nếu chưa có)
    public static void createRoom(String appId, String roomId) {
        if (appId == null || roomId == null) return;
        
        appRooms.computeIfAbsent(appId, k -> new HashMap<>())
                .computeIfAbsent(roomId, k -> new HashSet<>());
        
        // Record activity when room is created
        ChatActivityTracker.recordRoomActivity(appId, roomId);
        logger.debug("📌 Room created: appId={}, roomId={}", appId, roomId);
    }

    // Thêm user vào phòng
    public static void addUserToRoom(String appId, String roomId, String userId) {
        if (appId == null || roomId == null || userId == null) return;
        
        createRoom(appId, roomId);
        appRooms.get(appId).get(roomId).add(userId);
        
        // Record activity when user is added
        ChatActivityTracker.recordRoomActivity(appId, roomId);
        ChatActivityTracker.recordUserActivity(appId, userId);
        logger.debug("👤 User added to room: appId={}, roomId={}, userId={}", appId, roomId, userId);
    }

    // Lấy danh sách phòng chat của app
    public static Set<String> getRooms(String appId) {
        if (appId == null) return new HashSet<>();
        return appRooms.getOrDefault(appId, Collections.emptyMap()).keySet();
    }

    // Lấy danh sách user trong phòng
    public static Set<String> getUsersInRoom(String appId, String roomId) {
        if (appId == null || roomId == null) return new HashSet<>();
        return appRooms.getOrDefault(appId, Collections.emptyMap()).getOrDefault(roomId, Collections.emptySet());
    }
    
    /**
     * Remove user from room (usually on disconnect)
     */
    public static void removeUserFromRoom(String appId, String roomId, String userId) {
        if (appId == null || roomId == null || userId == null) return;
        
        Map<String, Set<String>> appRoomMap = appRooms.get(appId);
        if (appRoomMap != null) {
            Set<String> room = appRoomMap.get(roomId);
            if (room != null) {
                room.remove(userId);
                logger.debug("👤 User removed from room: appId={}, roomId={}, userId={}, remainingUsers={}", 
                    appId, roomId, userId, room.size());
                
                // If room is empty, optionally remove it
                if (room.isEmpty()) {
                    appRoomMap.remove(roomId);
                    ChatActivityTracker.removeRoomActivity(appId, roomId);
                    logger.debug("🗑️ Empty room removed: appId={}, roomId={}", appId, roomId);
                }
            }
        }
    }
    
    /**
     * Clear all rooms for an app (useful for testing/reset)
     */
    public static void clearAppRooms(String appId) {
        if (appId == null) return;
        appRooms.remove(appId);
        logger.info("🧹 All rooms cleared for appId={}", appId);
    }
}
