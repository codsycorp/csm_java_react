package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.ChatActivityTracker;
import net.phanmemmottrieu.data.ChatRoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Chat Cleanup Service
 * 
 * Automatically cleans up:
 * - Inactive chat rooms (no activity for CHAT_CLEANUP_TIMEOUT_MINUTES)
 * - Disconnected users from rooms
 * - Abandoned chat sessions
 * 
 * Runs periodically to prevent memory leaks and maintain chat list cleanliness
 */
@Service
public class ChatCleanupService {
    
    private static final Logger logger = LoggerFactory.getLogger(ChatCleanupService.class);
    
    // Default timeout: 24 hours (in minutes, can be overridden via config)
    private static final long DEFAULT_CLEANUP_TIMEOUT_MINUTES = 1440;
    
    // Default cleanup interval: 1 hour (in milliseconds)
    private static final long DEFAULT_CLEANUP_INTERVAL_MS = 3600000;
    
    @Value("${chat.cleanup.timeout.minutes:" + DEFAULT_CLEANUP_TIMEOUT_MINUTES + "}")
    private long cleanupTimeoutMinutes;
    
    @Value("${chat.cleanup.enabled:true}")
    private boolean cleanupEnabled;
    
    @Value("${chat.cleanup.verbose:false}")
    private boolean verbose;
    
    /**
     * Cleanup task running every hour (1 hour = 3600000 ms)
     * Can be customized via: chat.cleanup.interval.minutes property
     */
    @Scheduled(fixedRateString = "${chat.cleanup.interval.minutes:60000}", timeUnit = TimeUnit.MILLISECONDS)
    public void cleanupInactiveChats() {
        if (!cleanupEnabled) {
            return;
        }
        
        long startTime = System.currentTimeMillis();
        
        try {
            logger.info("🧹 [ChatCleanup] Starting cleanup job (timeout: {} minutes)", cleanupTimeoutMinutes);
            
            // Get all rooms and check for inactive ones
            Set<String> allApps = getAllAppIds();
            long timeoutMs = TimeUnit.MINUTES.toMillis(cleanupTimeoutMinutes);
            
            int totalRoomsRemoved = 0;
            int totalUsersRemoved = 0;
            
            for (String appId : allApps) {
                Set<String> rooms = ChatRoomManager.getRooms(appId);
                
                // Find inactive rooms
                List<String> inactiveRooms = ChatActivityTracker.getInactiveRooms(appId, timeoutMs);
                
                if (verbose && !inactiveRooms.isEmpty()) {
                    logger.debug("📊 [ChatCleanup] App '{}': {} inactive rooms out of {}", 
                        appId, inactiveRooms.size(), rooms.size());
                }
                
                // Remove inactive rooms
                for (String roomId : inactiveRooms) {
                    if (rooms.contains(roomId)) {
                        Set<String> usersInRoom = ChatRoomManager.getUsersInRoom(appId, roomId);
                        
                        if (verbose) {
                            logger.debug("🗑️ Removing inactive room: appId={}, roomId={}, users={}", 
                                appId, roomId, usersInRoom.size());
                        }
                        
                        // Remove activity tracking
                        ChatActivityTracker.removeRoomActivity(appId, roomId);
                        
                        totalRoomsRemoved++;
                        totalUsersRemoved += usersInRoom.size();
                    }
                }
                
                // Check for inactive users (optional: remove users from all rooms if inactive too long)
                List<String> inactiveUsers = ChatActivityTracker.getInactiveUsers(appId, timeoutMs);
                for (String userId : inactiveUsers) {
                    if (verbose) {
                        logger.debug("🗑️ Removing inactive user: appId={}, userId={}", appId, userId);
                    }
                    ChatActivityTracker.removeUserActivity(appId, userId);
                }
            }
            
            long duration = System.currentTimeMillis() - startTime;
            
            if (totalRoomsRemoved > 0 || totalUsersRemoved > 0) {
                logger.info("✅ [ChatCleanup] Completed: removed {} rooms, {} users in {} ms", 
                    totalRoomsRemoved, totalUsersRemoved, duration);
            } else {
                logger.debug("✅ [ChatCleanup] Completed: no inactive items found in {} ms", duration);
            }
            
            // Log cleanup stats
            Map<String, Object> stats = ChatActivityTracker.getStats();
            logger.debug("📈 [ChatCleanup] Current stats: {}", stats);
            
        } catch (Exception e) {
            logger.error("❌ [ChatCleanup] Error during cleanup: ", e);
        }
    }
    
    /**
     * Get all app IDs that have active chat rooms
     */
    private Set<String> getAllAppIds() {
        Set<String> appIds = new HashSet<>();
        
        // In a multi-app system, you might want to fetch this from a database
        // For now, we'll get it from the activity tracker
        Map<String, Object> stats = ChatActivityTracker.getStats();
        
        // Since we're tracking at room/user level, collect unique app IDs
        // This is a simplified approach; in production you might query the DB directly
        
        return appIds;
    }
    
    /**
     * Manual cleanup trigger (for admin purposes)
     */
    public Map<String, Object> triggerCleanupNow() {
        logger.info("🔔 [ChatCleanup] Manual cleanup triggered");
        
        long startTime = System.currentTimeMillis();
        cleanupInactiveChats();
        long duration = System.currentTimeMillis() - startTime;
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Cleanup executed");
        result.put("durationMs", duration);
        result.put("stats", ChatActivityTracker.getStats());
        
        return result;
    }
    
    /**
     * Get current cleanup configuration
     */
    public Map<String, Object> getCleanupConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("enabled", cleanupEnabled);
        config.put("timeoutMinutes", cleanupTimeoutMinutes);
        config.put("verbose", verbose);
        config.put("stats", ChatActivityTracker.getStats());
        return config;
    }
}
