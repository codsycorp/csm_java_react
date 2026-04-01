package net.phanmemmottrieu.data;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks last activity time for each chat room and user
 * Used to cleanup inactive chats
 */
public class ChatActivityTracker {
    // Map<appId, Map<roomId, lastActivityTime>>
    private static final Map<String, Map<String, Long>> roomActivityMap = new ConcurrentHashMap<>();
    
    // Map<appId, Map<userId, lastActivityTime>>
    private static final Map<String, Map<String, Long>> userActivityMap = new ConcurrentHashMap<>();
    
    /**
     * Record activity for a room
     */
    public static void recordRoomActivity(String appId, String roomId) {
        if (appId == null || roomId == null) return;
        
        roomActivityMap.computeIfAbsent(appId, k -> new ConcurrentHashMap<>())
                .put(roomId, System.currentTimeMillis());
    }
    
    /**
     * Record activity for a user
     */
    public static void recordUserActivity(String appId, String userId) {
        if (appId == null || userId == null) return;
        
        userActivityMap.computeIfAbsent(appId, k -> new ConcurrentHashMap<>())
                .put(userId, System.currentTimeMillis());
    }
    
    /**
     * Get last activity time for a room
     */
    public static Long getLastRoomActivity(String appId, String roomId) {
        return roomActivityMap.getOrDefault(appId, new ConcurrentHashMap<>()).get(roomId);
    }
    
    /**
     * Get last activity time for a user
     */
    public static Long getLastUserActivity(String appId, String userId) {
        return userActivityMap.getOrDefault(appId, new ConcurrentHashMap<>()).get(userId);
    }
    
    /**
     * Get all inactive rooms in an app
     * Returns list of roomId that haven't been active for at least timeoutMs
     */
    public static List<String> getInactiveRooms(String appId, long timeoutMs) {
        if (appId == null) return new ArrayList<>();
        
        Map<String, Long> roomActivities = roomActivityMap.getOrDefault(appId, new ConcurrentHashMap<>());
        long now = System.currentTimeMillis();
        List<String> inactiveRooms = new ArrayList<>();
        
        for (Map.Entry<String, Long> entry : roomActivities.entrySet()) {
            if (now - entry.getValue() >= timeoutMs) {
                inactiveRooms.add(entry.getKey());
            }
        }
        
        return inactiveRooms;
    }
    
    /**
     * Get all inactive users in an app
     * Returns list of userId that haven't been active for at least timeoutMs
     */
    public static List<String> getInactiveUsers(String appId, long timeoutMs) {
        if (appId == null) return new ArrayList<>();
        
        Map<String, Long> userActivities = userActivityMap.getOrDefault(appId, new ConcurrentHashMap<>());
        long now = System.currentTimeMillis();
        List<String> inactiveUsers = new ArrayList<>();
        
        for (Map.Entry<String, Long> entry : userActivities.entrySet()) {
            if (now - entry.getValue() >= timeoutMs) {
                inactiveUsers.add(entry.getKey());
            }
        }
        
        return inactiveUsers;
    }
    
    /**
     * Remove room from activity tracking
     */
    public static void removeRoomActivity(String appId, String roomId) {
        if (appId == null || roomId == null) return;
        
        Map<String, Long> appRooms = roomActivityMap.get(appId);
        if (appRooms != null) {
            appRooms.remove(roomId);
        }
    }
    
    /**
     * Remove user from activity tracking
     */
    public static void removeUserActivity(String appId, String userId) {
        if (appId == null || userId == null) return;
        
        Map<String, Long> appUsers = userActivityMap.get(appId);
        if (appUsers != null) {
            appUsers.remove(userId);
        }
    }
    
    /**
     * Clear all activity data (typically on server restart)
     */
    public static void clearAll() {
        roomActivityMap.clear();
        userActivityMap.clear();
    }
    
    /**
     * Get stats about tracked activities
     */
    public static Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        
        int totalRooms = roomActivityMap.values().stream().mapToInt(Map::size).sum();
        int totalUsers = userActivityMap.values().stream().mapToInt(Map::size).sum();
        
        stats.put("trackedApps", Math.max(roomActivityMap.size(), userActivityMap.size()));
        stats.put("totalTrackedRooms", totalRooms);
        stats.put("totalTrackedUsers", totalUsers);
        stats.put("roomActivityMapSize", roomActivityMap.size());
        stats.put("userActivityMapSize", userActivityMap.size());
        
        return stats;
    }
}
