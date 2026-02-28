package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service quản lý lịch sử chat với persistence vào RocksDB
 * 
 * Features:
 * - Lưu chat messages vào database (persist qua restart)
 * - Load lại history khi khởi động
 * - Support chat giữa admin và guest users
 * - Track guest phone numbers
 */
@Service
public class ChatPersistenceService {
    
    private static final Logger logger = LoggerFactory.getLogger(ChatPersistenceService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Autowired
    private RecordManager recordManager;
    
    // In-memory cache để truy xuất nhanh
    private final List<ChatMessage> chatCache = Collections.synchronizedList(new ArrayList<>());
    
    // Map để track guest phone numbers theo appId
    private final Map<String, Set<String>> guestPhonesByApp = new ConcurrentHashMap<>();
    
    private static final String CHAT_TABLE = "chat_messages";
    private static final int CACHE_SIZE_LIMIT = 10000; // Giữ 10k messages trong cache
    private final Set<String> loadedApps = ConcurrentHashMap.newKeySet();
    
    @PostConstruct
    public void init() {
        objectMapper.registerModule(new JavaTimeModule());
        logger.info("🔄 ChatPersistenceService initializing...");
        logger.info("ℹ️ Chat messages will be persisted per appId into table '{}'.", CHAT_TABLE);
    }
    
    /**
     * Load chat history cho một appId cụ thể từ RocksDB vào cache
     */
    private void loadChatHistoryFromDatabase(String appId) {
        String dbAppId = normalizeAppId(appId);
        try {
            logger.info("📖 Loading chat history for appId={} from RocksDB", dbAppId);

            // Tạo table nếu chưa có
            ensureChatTable(dbAppId);

            // Đảm bảo chỉ mục Lucene của bảng chat đã sẵn sàng cho truy vấn nhanh
            try {
                recordManager.indexExistingRecords(dbAppId, CHAT_TABLE);
            } catch (Exception e) {
                logger.warn("Cannot rebuild Lucene index for chat table (appId={}): {}", dbAppId, e.getMessage());
            }
            
            // Nạp dữ liệu đã lưu vào cache để client thấy được lịch sử sau khi restart
            Map<String, Object> scanResult = recordManager.fullScan(dbAppId, CHAT_TABLE);
            Object rowsObj = scanResult != null ? scanResult.get("rows") : null;
            if (rowsObj instanceof List<?>) {
                List<?> rows = (List<?>) rowsObj;
                List<ChatMessage> loaded = new ArrayList<>();
                for (Object rowObj : rows) {
                    if (rowObj instanceof Map<?, ?> rowMap) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> row = (Map<String, Object>) rowMap;
                        ChatMessage msg = convertMapToChatMessage(row);
                        if (msg != null) {
                            // Bảo vệ timestamp để sắp xếp đúng
                            if (msg.getTimestamp() == null) {
                                msg.setTimestamp(0L);
                            }
                            loaded.add(msg);
                        }
                    }
                }

                // Sắp xếp theo timestamp tăng dần và giới hạn dung lượng cache
                loaded.sort(Comparator.comparingLong(m -> m.getTimestamp() != null ? m.getTimestamp() : 0L));
                if (loaded.size() > CACHE_SIZE_LIMIT) {
                    loaded = loaded.subList(loaded.size() - CACHE_SIZE_LIMIT, loaded.size());
                }

                synchronized (chatCache) {
                    chatCache.removeIf(msg -> normalizeAppId(msg.getAppId()).equals(dbAppId));
                    chatCache.addAll(loaded);
                }

                // Khôi phục danh sách guest phones theo appId
                guestPhonesByApp.remove(dbAppId);
                for (ChatMessage msg : loaded) {
                    if (msg.getAppId() != null && msg.getGuestPhone() != null && !msg.getGuestPhone().isEmpty()) {
                        guestPhonesByApp.computeIfAbsent(normalizeAppId(msg.getAppId()), k -> ConcurrentHashMap.newKeySet())
                            .add(msg.getGuestPhone());
                    }
                }

                logger.info("✅ Loaded {} chat messages from RocksDB into cache for appId {}", loaded.size(), dbAppId);
            }
            loadedApps.add(dbAppId);
        } catch (Exception e) {
            logger.error("❌ Error initializing chat persistence for appId {}: {}", dbAppId, e.getMessage(), e);
        }
    }

    /**
     * Đảm bảo cache được nạp từ RocksDB trước khi phục vụ history
     */
    private void ensureCacheLoadedFromDb(String appId) {
        String dbAppId = normalizeAppId(appId);
        if (loadedApps.contains(dbAppId)) return;
        synchronized (loadedApps) {
            if (loadedApps.contains(dbAppId)) return;
            loadChatHistoryFromDatabase(dbAppId);
        }
    }
    
    /**
     * Lưu chat message vào database và cache
     */
    public synchronized void saveMessage(ChatMessage message) {
        try {
            // 🔥 CRITICAL: Validate and normalize appId
            String appId = message.getAppId();
            if (appId == null || appId.isBlank()) {
                appId = inferAppIdFromRoom(message.getRoom());
                message.setAppId(appId);
                logger.warn("⚠️ Missing appId in message - inferred from room: {} → {}", message.getRoom(), appId);
            }
            
            String dbAppId = normalizeAppId(appId);
            
            logger.info("💾 [ChatPersistenceService.saveMessage] Saving to appId={}, dbAppId={}, room={}, guestPhone={}, to={}",
                       appId, dbAppId, message.getRoom(), message.getGuestPhone(), message.getTo());

            // Thêm vào cache
            chatCache.add(message);
            
            // Track guest phone
            if (message.getAppId() != null && message.getGuestPhone() != null && !message.getGuestPhone().isEmpty()) {
                guestPhonesByApp.computeIfAbsent(message.getAppId(), k -> ConcurrentHashMap.newKeySet())
                    .add(message.getGuestPhone());
                logger.info("📱 Tracked guest phone: appId={}, phone={}", message.getAppId(), message.getGuestPhone());
            }
            
            // Giới hạn cache size
            if (chatCache.size() > CACHE_SIZE_LIMIT) {
                chatCache.remove(0);
            }
            
            // Persist vào database
            persistMessageToDatabase(dbAppId, message);
            loadedApps.add(dbAppId);
            
        } catch (Exception e) {
            logger.error("❌ Error saving chat message: {}", e.getMessage(), e);
        }
    }
    
    /**
     * Persist message vào RocksDB
     */
    private void persistMessageToDatabase(String appId, ChatMessage message) {
        try {
            // Lưu tất cả chat vào database theo appId
            ensureChatTable(appId);
            
            // Tạo unique ID cho message
            String messageId = UUID.randomUUID().toString();
            if (message.getTimestamp() == null) {
                message.setTimestamp(System.currentTimeMillis());
            }
            
            logger.info("🔄 [persistMessageToDatabase] Writing to appId={}, messageId={}, timestamp={}", 
                       appId, messageId, message.getTimestamp());
            
            // Convert message thành Map
            Map<String, Object> record = new HashMap<>();
            record.put("id", messageId);
            record.put("room", message.getRoom());
            record.put("username", message.getUsername());
            record.put("userId", message.getUserId());
            record.put("message", message.getMessage());
            record.put("timestamp", message.getTimestamp());
            record.put("appId", message.getAppId());
            record.put("to", message.getTo());
            record.put("guestPhone", message.getGuestPhone());
            record.put("avatar", message.getAvatar());
            record.put("isAdmin", message.getIsAdmin());
            record.put("eventType", message.getEventType());
            
            if (message.getReadBy() != null) {
                record.put("readBy", String.join(",", message.getReadBy()));
            }
            
            // 🔥 CRITICAL: Create record with appId to ensure it's stored in the correct database
            logger.info("✅ [persistMessageToDatabase] About to call recordManager.createRecord with appId={}", appId);
            recordManager.createRecord(appId, CHAT_TABLE, record);
            logger.info("✅ [persistMessageToDatabase] Successfully saved to database - appId={}, guestPhone={}, room={}", 
                       appId, message.getGuestPhone(), message.getRoom());
            
        } catch (Exception e) {
            logger.error("❌ Error persisting message to database: appId={}, error={}", appId, e.getMessage(), e);
        }
    }
    
    /**
     * Đảm bảo bảng chat tồn tại trong database
     */
    private void ensureChatTable(String appId) {
        try {
            String dbAppId = normalizeAppId(appId);
            // Kiểm tra table đã tồn tại chưa
            Map<String, Object> tableStruct = recordManager.find(dbAppId, "index", 
                createFilter("id", "eq", CHAT_TABLE));
            
            if (tableStruct != null && !tableStruct.isEmpty()) {
                return; // Table đã tồn tại
            }
            
            // Tạo table structure
            Map<String, Object> struct = new HashMap<>();
            struct.put("fieldsPK", List.of("id"));
            struct.put("fieldsSearch", List.of("room", "userId", "username", "to", "guestPhone", "message", "appId", "timestamp"));
            
            Map<String, Object> record = new HashMap<>();
            record.put("id", CHAT_TABLE);
            record.put("struct", struct);
            
            recordManager.createRecord(dbAppId, "index", record);
            logger.info("✅ Created chat table for appId: {}", dbAppId);
            
        } catch (Exception e) {
            logger.error("❌ Failed to ensure chat table for appId {}: {}", appId, e.getMessage());
        }
    }
    
    /**
     * Lấy lịch sử chat theo room
     */
    public List<ChatMessage> getHistory(String appId, String room, int limit) {
        String dbAppId = normalizeAppId(appId);
        // Ưu tiên truy vấn qua Lucene để lấy nhanh từ RocksDB
        List<ChatMessage> lucene = queryHistoryViaLucene(dbAppId, buildEqFilter("room", room), limit);
        if (!lucene.isEmpty()) return lucene;

        // Fallback cache
        ensureCacheLoadedFromDb(dbAppId);
        List<ChatMessage> result = new ArrayList<>();
        synchronized (chatCache) {
            for (int i = chatCache.size() - 1; i >= 0 && result.size() < limit; i--) {
                ChatMessage msg = chatCache.get(i);
                if (msg.getRoom() != null && msg.getRoom().equals(room) && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                    result.add(0, msg);
                }
            }
        }
        return result;
    }
    
    /**
     * Lấy lịch sử chat theo appId (cho admin)
     */
    public List<ChatMessage> getHistoryByAppId(String appId, int limit) {
        String dbAppId = normalizeAppId(appId);
        List<ChatMessage> lucene = queryHistoryViaLucene(dbAppId, buildEqFilter("appId", appId), limit);
        if (!lucene.isEmpty()) return lucene;

        ensureCacheLoadedFromDb(dbAppId);
        List<ChatMessage> result = new ArrayList<>();
        synchronized (chatCache) {
            for (int i = chatCache.size() - 1; i >= 0 && result.size() < limit; i--) {
                ChatMessage msg = chatCache.get(i);
                if (msg.getAppId() != null && msg.getAppId().equals(appId) && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                    result.add(0, msg);
                }
            }
        }
        return result;
    }
    
    /**
     * Lấy lịch sử chat của guest phone cụ thể
     */
    public List<ChatMessage> getHistoryByGuestPhone(String appId, String guestPhone, int limit) {
        String dbAppId = normalizeAppId(appId);
        // OR (guestPhone == x) OR (to == x) and appId == appId
        SearchFilter byApp = buildEqFilter("appId", appId);
        SearchFilter byGuest = buildEqFilter("guestPhone", guestPhone);
        SearchFilter byTo = buildEqFilter("to", guestPhone);

        SearchFilter orGuest = new SearchFilter();
        orGuest.setOperator("OR");
        orGuest.setConditions(Arrays.asList(byGuest, byTo));

        SearchFilter root = new SearchFilter();
        root.setOperator("AND");
        root.setConditions(Arrays.asList(byApp, orGuest));

        List<ChatMessage> lucene = queryHistoryViaLucene(dbAppId, root, limit);
        if (!lucene.isEmpty()) return lucene;

        ensureCacheLoadedFromDb(dbAppId);
        List<ChatMessage> result = new ArrayList<>();
        synchronized (chatCache) {
            for (int i = chatCache.size() - 1; i >= 0 && result.size() < limit; i--) {
                ChatMessage msg = chatCache.get(i);
                if (msg.getAppId() != null && msg.getAppId().equals(appId) && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                    String msgGuestPhone = msg.getGuestPhone();
                    if ((msgGuestPhone != null && msgGuestPhone.equals(guestPhone)) ||
                        (msg.getTo() != null && msg.getTo().equals(guestPhone))) {
                        result.add(0, msg);
                    }
                }
            }
        }
        return result;
    }
    
    /**
     * Lấy danh sách guest phones theo appId
     */
    public List<String> getGuestPhonesByAppId(String appId) {
        String dbAppId = normalizeAppId(appId);
        ensureCacheLoadedFromDb(dbAppId);
        Set<String> phones = guestPhonesByApp.getOrDefault(dbAppId, Collections.emptySet());
        return new ArrayList<>(phones);
    }

    // === Lucene helper methods ===
    private SearchFilter buildEqFilter(String field, String value) {
        SearchFilter f = new SearchFilter();
        f.setField(field);
        f.setType("eq");
        f.setValue(value);
        return f;
    }

    private List<ChatMessage> queryHistoryViaLucene(String appId, SearchFilter filter, int limit) {
        try {
            // Dùng filterWithPagination để tận dụng searchKeys (Lucene) + trả rows đầy đủ
            Map<String, Object> resp = recordManager.filterWithPagination(appId, CHAT_TABLE, filter, limit, null);
            Object rowsObj = resp != null ? resp.get("rows") : null;
            if (rowsObj instanceof List<?>) {
                List<?> rows = (List<?>) rowsObj;
                List<ChatMessage> messages = new ArrayList<>();
                for (Object rowObj : rows) {
                    if (rowObj instanceof Map<?, ?> rowMap) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> row = (Map<String, Object>) rowMap;
                        ChatMessage msg = convertMapToChatMessage(row);
                        if (msg != null) {
                            messages.add(msg);
                        }
                    }
                }
                // Sắp xếp theo timestamp tăng dần và cắt theo limit
                messages.sort(Comparator.comparingLong(m -> m.getTimestamp() != null ? m.getTimestamp() : 0L));
                if (messages.size() > limit) {
                    return new ArrayList<>(messages.subList(messages.size() - limit, messages.size()));
                }
                return messages;
            }
        } catch (Exception e) {
            logger.warn("Lucene query for chat history failed, fallback to cache: {}", e.getMessage());
        }
        return Collections.emptyList();
    }
    
    /**
     * Đánh dấu tất cả messages trong room là đã đọc
     */
    public synchronized void markAllAsRead(String room, String userId) {
        String appId = normalizeAppId(inferAppIdFromRoom(room));
        ensureCacheLoadedFromDb(appId);
        synchronized (chatCache) {
            for (ChatMessage msg : chatCache) {
                if (msg.getRoom() != null && msg.getRoom().equals(room) && normalizeAppId(msg.getAppId()).equals(appId)) {
                    if (msg.getReadBy() == null) {
                        msg.setReadBy(new ArrayList<>());
                    }
                    if (!msg.getReadBy().contains(userId)) {
                        msg.getReadBy().add(userId);
                    }
                }
            }
        }
    }
    
    /**
     * Đánh dấu messages của guest phone là đã đọc
     */
    public synchronized void markAllAsReadByGuestPhone(String appId, String guestPhone) {
        String dbAppId = normalizeAppId(appId);
        ensureCacheLoadedFromDb(dbAppId);
        synchronized (chatCache) {
            for (ChatMessage msg : chatCache) {
                if (msg.getAppId() != null && msg.getAppId().equals(appId) && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                    String msgGuestPhone = msg.getGuestPhone();
                    if ((msg.getTo() != null && msg.getTo().equals(guestPhone)) ||
                        (msgGuestPhone != null && msgGuestPhone.equals(guestPhone))) {
                        if (msg.getReadBy() == null) {
                            msg.setReadBy(new ArrayList<>());
                        }
                        String readerId = "guest:" + guestPhone;
                        if (!msg.getReadBy().contains(readerId)) {
                            msg.getReadBy().add(readerId);
                        }
                    }
                }
            }
        }
    }
    
    // Helper methods
    
    private net.phanmemmottrieu.data.SearchFilter createFilter(String field, String type, Object value) {
        net.phanmemmottrieu.data.SearchFilter filter = new net.phanmemmottrieu.data.SearchFilter();
        filter.setField(field);
        filter.setType(type);
        filter.setValue(value);
        return filter;
    }

    private String normalizeAppId(String appId) {
        return (appId == null || appId.isBlank()) ? "csm" : appId;
    }

    private String inferAppIdFromRoom(String room) {
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
    
    private ChatMessage convertMapToChatMessage(Map<String, Object> row) {
        ChatMessage msg = new ChatMessage();
        msg.setRoom((String) row.get("room"));
        msg.setUsername((String) row.get("username"));
        msg.setUserId((String) row.get("userId"));
        msg.setMessage((String) row.get("message"));
        msg.setAppId((String) row.get("appId"));
        msg.setTo((String) row.get("to"));
        msg.setGuestPhone((String) row.get("guestPhone"));
        msg.setAvatar((String) row.get("avatar"));
        msg.setEventType((String) row.get("eventType"));
        
        if (row.get("timestamp") instanceof Number) {
            msg.setTimestamp(((Number) row.get("timestamp")).longValue());
        }
        
        if (row.get("isAdmin") instanceof Boolean) {
            msg.setIsAdmin((Boolean) row.get("isAdmin"));
        }
        
        if (row.get("readBy") instanceof String) {
            String readByStr = (String) row.get("readBy");
            if (readByStr != null && !readByStr.isEmpty()) {
                msg.setReadBy(Arrays.asList(readByStr.split(",")));
            }
        }
        
        return msg;
    }
    
    /**
     * Get message by timestamp
     */
    public ChatMessage getMessageByTimestamp(String appId, long timestamp) {
        String dbAppId = normalizeAppId(appId);
        
        // Check cache first
        synchronized (chatCache) {
            for (ChatMessage msg : chatCache) {
                if (msg.getTimestamp() != null && msg.getTimestamp().equals(timestamp)
                        && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                    return msg;
                }
            }
        }
        
        // If not in cache, scan database
        try {
            Map<String, Object> scanResult = recordManager.fullScan(dbAppId, CHAT_TABLE);
            Object rowsObj = scanResult != null ? scanResult.get("rows") : null;
            
            if (rowsObj instanceof List<?>) {
                List<?> rows = (List<?>) rowsObj;
                for (Object rowObj : rows) {
                    if (rowObj instanceof Map<?, ?> rowMap) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> record = (Map<String, Object>) rowMap;
                        
                        Object recordTimestamp = record.get("timestamp");
                        Long recordTs = null;
                        if (recordTimestamp instanceof Number) {
                            recordTs = ((Number) recordTimestamp).longValue();
                        }
                        
                        if (recordTs != null && recordTs.equals(timestamp)) {
                            // Found! Convert to ChatMessage
                            return convertToChatMessage(record);
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Error scanning database for message timestamp {}: {}", timestamp, e.getMessage());
        }
        
        return null;
    }
    
    /**
     * Convert database record to ChatMessage
     */
    private ChatMessage convertToChatMessage(Map<String, Object> record) {
        ChatMessage msg = new ChatMessage();
        msg.setRoom((String) record.get("room"));
        msg.setUsername((String) record.get("username"));
        msg.setUserId((String) record.get("userId"));
        msg.setMessage((String) record.get("message"));
        msg.setAvatar((String) record.get("avatar"));
        msg.setIsAdmin(getBoolean(record.get("isAdmin")));
        msg.setAppId((String) record.get("appId"));
        msg.setGuestPhone((String) record.get("guestPhone"));
        msg.setEventType((String) record.get("eventType"));
        
        Object tsObj = record.get("timestamp");
        if (tsObj instanceof Number) {
            msg.setTimestamp(((Number) tsObj).longValue());
        }
        
        Object readByObj = record.get("readBy");
        if (readByObj instanceof List<?>) {
            @SuppressWarnings("unchecked")
            List<String> readByList = (List<String>) readByObj;
            msg.setReadBy(readByList);
        }
        
        msg.setTo((String) record.get("to"));
        
        return msg;
    }
    
    private boolean getBoolean(Object obj) {
        if (obj instanceof Boolean) return (Boolean) obj;
        if (obj instanceof String) return "true".equalsIgnoreCase((String) obj);
        return false;
    }
    
    /**
     * Xoá tin nhắn theo timestamp
     */
    public boolean deleteMessage(String appId, long timestamp) {
        String dbAppId = normalizeAppId(appId);
        try {
            logger.info("🗑️ Attempting to delete message with timestamp: {} for appId {}", timestamp, dbAppId);
            
            // Tìm message trong cache để lấy id (vì timestamp không được index trong Lucene)
            ChatMessage messageToDelete = null;
            synchronized (chatCache) {
                for (ChatMessage msg : chatCache) {
                    if (msg.getTimestamp() != null && msg.getTimestamp().equals(timestamp)
                            && normalizeAppId(msg.getAppId()).equals(dbAppId)) {
                        messageToDelete = msg;
                        break;
                    }
                }
            }
            
            if (messageToDelete == null) {
                logger.warn("⚠️ Message with timestamp {} not found in cache", timestamp);
                return false;
            }
            
            logger.info("📝 Found message in cache: id={} (will be generated), timestamp={}", "N/A", timestamp);
            
            // Xoá khỏi cache
                boolean removed = chatCache.removeIf(msg -> msg.getTimestamp() != null && msg.getTimestamp().equals(timestamp)
                    && normalizeAppId(msg.getAppId()).equals(dbAppId));
            logger.info("✅ Removed from cache: {}", removed);
            
            // Xoá khỏi database bằng cách scan toàn bộ và tìm theo timestamp
            // (vì timestamp không nằm trong fieldsSearch nên không filter được)
                ensureChatTable(dbAppId);
            
            // Scan toàn bộ table để tìm message có timestamp khớp
                Map<String, Object> scanResult = recordManager.fullScan(dbAppId, CHAT_TABLE);
            Object rowsObj = scanResult != null ? scanResult.get("rows") : null;
            
            if (rowsObj instanceof List<?>) {
                List<?> rows = (List<?>) rowsObj;
                logger.info("📋 Scanning {} total messages to find timestamp {}", rows.size(), timestamp);
                
                for (Object rowObj : rows) {
                    if (rowObj instanceof Map<?, ?> rowMap) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> record = (Map<String, Object>) rowMap;
                        
                        // Kiểm tra timestamp
                        Object recordTimestamp = record.get("timestamp");
                        Long recordTs = null;
                        if (recordTimestamp instanceof Number) {
                            recordTs = ((Number) recordTimestamp).longValue();
                        }
                        
                        if (recordTs != null && recordTs.equals(timestamp)) {
                            // Tìm thấy! Xóa record này
                            Object recordId = record.get("id");
                            logger.info("📄 Found matching record: id={}, timestamp={}", recordId, recordTs);
                            
                            if (recordId == null) {
                                logger.error("❌ Record missing 'id' field - cannot delete!");
                                continue;
                            }
                            
                            // Xóa từ database
                            recordManager.deleteRecord(dbAppId, CHAT_TABLE, record);
                            logger.info("✅ Successfully deleted message from database: id={}, timestamp={}", recordId, timestamp);
                            return true;
                        }
                    }
                }
                
                logger.warn("⚠️ Message with timestamp {} not found in database after scanning {} records", timestamp, rows.size());
            } else {
                logger.warn("⚠️ fullScan returned no rows");
            }
            
            return false;
        } catch (Exception e) {
            logger.error("❌ Error deleting message: {}", e.getMessage(), e);
            return false;
        }
    }

    @PreDestroy
    public void cleanup() {
        logger.info("🔄 ChatPersistenceService shutting down...");
        chatCache.clear();
        guestPhonesByApp.clear();
    }
}
