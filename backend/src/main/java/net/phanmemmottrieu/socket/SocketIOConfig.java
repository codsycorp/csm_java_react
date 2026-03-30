package net.phanmemmottrieu.socket;
import net.phanmemmottrieu.data.ChatHistoryManager;


import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.AckRequest;
import com.corundumstudio.socketio.BroadcastOperations;

import jakarta.annotation.PreDestroy;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.model.ChatMessage;
import net.phanmemmottrieu.model.LoginRequest;
import net.phanmemmottrieu.model.LoginResponse;
import net.phanmemmottrieu.model.RegistrationResponse;
import net.phanmemmottrieu.service.UserService;
import net.phanmemmottrieu.service.ChatPersistenceService;
import net.phanmemmottrieu.service.CRMService;
import net.phanmemmottrieu.service.AIProviderFactory;
import net.phanmemmottrieu.util.PortKillerUtil;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.text.Normalizer;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;

@Component
public class SocketIOConfig implements ApplicationListener<ContextRefreshedEvent> {

    @Value("${socket.server.port}")
    private int socketPort;

    @Value("${socket.server.host:0.0.0.0}")
    private String socketHost;

    private final SocketIOServer server;

    public SocketIOConfig(SocketIOServer server) {
        this.server = server;
    }

    private volatile boolean isServerRunning = false;

    private final Map<String, Set<UUID>> roomSessions = new ConcurrentHashMap<>();
    private final Map<UUID, String> sessionUsernames = new ConcurrentHashMap<>();
    private final Map<UUID, String> sessionAppIds = new ConcurrentHashMap<>();
    private static final Logger logger = LoggerFactory.getLogger(SocketIOConfig.class);

    @Autowired
    private UserService userService;

    @Autowired
    private RecordManager recordManager;
    
    @Autowired
    private ChatPersistenceService chatPersistenceService;
    
    @Autowired
    private CRMService crmService;

    @Autowired
    private AIProviderFactory aiProviderFactory;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService chatAiScheduler = Executors.newScheduledThreadPool(2);
    private final Map<String, Future<?>> pendingGuestWelcomeTasks = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> pendingGuestNoReplyTasks = new ConcurrentHashMap<>();
    private final Map<UUID, String> sessionGuestPhones = new ConcurrentHashMap<>();
    private final Map<UUID, String> sessionGuestSessionIds = new ConcurrentHashMap<>();
    private static final String POLITE_GENERIC_WELCOME = "Xin chao anh/chị, em rat vui duoc ho tro. Anh/chị vui long cho em biet nhu cau dang quan tam va cach lien he de ben em tu van nhanh va chinh xac hon a.";

    private static final long AI_FOLLOWUP_DELAY_MS = 60_000L;
    private static final long AUTO_WELCOME_SUPPRESSION_WINDOW_MS = 3 * 60_000L;
    private static final String AI_ASSISTANT_USER_ID = "ai_assistant";
    private static final String AI_ASSISTANT_USERNAME = "Tu van vien";

    // Extract appId from room patterns: guest:{appId};{phone}, app:{appId}, user:{appId};..., private:{appId};...
    private String parseAppIdFromRoom(String room) {
        if (room == null || room.isBlank()) return null;
        String[] parts = room.split(":", 2);
        if (parts.length != 2) return null;
        String payload = parts[1];
        if (payload == null || payload.isBlank()) return null;
        int semi = payload.indexOf(";");
        return semi >= 0 ? payload.substring(0, semi) : payload;
    }

    private String parseGuestPhoneFromRoom(String room) {
        if (room == null || room.isBlank() || !room.startsWith("guest:")) return null;
        int semi = room.indexOf(';');
        if (semi < 0 || semi + 1 >= room.length()) return null;
        String guestPhone = room.substring(semi + 1).trim();
        return guestPhone.isEmpty() ? null : guestPhone;
    }

    private String guestKey(String appId, String guestIdentity) {
        return (appId == null ? "" : appId.trim()) + "::" + (guestIdentity == null ? "" : guestIdentity.trim());
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private void cancelGuestWelcomeTask(String appId, String guestIdentity) {
        String key = guestKey(appId, guestIdentity);
        Future<?> future = pendingGuestWelcomeTasks.remove(key);
        if (future != null) {
            future.cancel(false);
        }
    }

    private void cancelGuestNoReplyTask(String appId, String guestIdentity) {
        String key = guestKey(appId, guestIdentity);
        ScheduledFuture<?> future = pendingGuestNoReplyTasks.remove(key);
        if (future != null) {
            future.cancel(false);
        }
    }

    private String extractAiText(String raw, String fallbackText) {
        if (raw == null || raw.isBlank()) return fallbackText;
        try {
            Map<?, ?> rawParsed = objectMapper.readValue(raw, Map.class);
            Map<String, Object> parsed = new HashMap<>();
            for (Map.Entry<?, ?> entry : rawParsed.entrySet()) {
                if (entry.getKey() != null) {
                    parsed.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            Object successObj = parsed.get("success");
            boolean success = !(successObj instanceof Boolean) || (Boolean) successObj;
            if (!success) {
                return fallbackText;
            }

            Object result = parsed.get("result");
            if (result instanceof String s && !s.isBlank()) {
                return s.trim();
            }

            if (result instanceof Map<?, ?> map) {
                Object text = map.get("message");
                if (text == null) text = map.get("text");
                if (text == null) text = map.get("reply");
                if (text instanceof String s && !s.isBlank()) {
                    return s.trim();
                }
                return objectMapper.writeValueAsString(map);
            }

            if (result != null) {
                return String.valueOf(result).trim();
            }
        } catch (Exception ignored) {
            // Some providers may return plain text; fallback to raw.
        }
        return raw.trim().isEmpty() ? fallbackText : raw.trim();
    }

    private String buildWelcomePrompt(String appId, String guestPhone) {
        String guestDescription = (guestPhone == null || guestPhone.isBlank())
                ? "Khach moi chua de lai so dien thoai"
                : "Khach co phone=" + guestPhone;
        return "Ban la nhan vien cham soc khach hang website appId=" + appId + ". "
            + guestDescription + " vua mo cua so chat va chua gui tin nhan. "
                + "Hay viet DUY NHAT 1 tin nhan tieng Viet lich su, chuyen nghiep, than thien, ngan gon (toi da 180 ky tu). "
                + "Muc tieu: chao khach, hoi nhu cau can ho tro va xin thong tin lien he mot cach tinh te. "
                + "KHONG dung placeholder nhu [Ten ban], [Ten cong ty]. "
                + "KHONG tu xung ten nhan vien/cong ty neu khong co du lieu xac thuc. "
                + "Khong nhac den AI, khong markdown, chi tra ve noi dung tin nhan.";
    }

    private String buildNoHumanReplyPrompt(String appId, String guestPhone, String guestMessage) {
        String guestDescription = (guestPhone == null || guestPhone.isBlank())
                ? "Khach moi chua de lai so dien thoai"
                : "Khach phone=" + guestPhone;
        return "Ban la nhan vien CSKH website appId=" + appId + ". "
                + guestDescription + " vua nhan: \"" + (guestMessage == null ? "" : guestMessage) + "\". "
                + "Da 1 phut chua co nguoi tra loi. Hay viet DUY NHAT 1 tin nhan tieng Viet tu nhien, ngan gon (toi da 220 ky tu), "
                + "tra loi dung van de khach vua hoi va kheo xin ten, cach lien he va san pham/nhu cau quan tam neu phu hop. "
                + "Giong nguoi that dang cham soc, khong robot, khong markdown.";
    }

    private String sanitizeGuestWelcomeText(String messageText, String eventType) {
        if (messageText == null) return "";
        String normalized = messageText.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty()) return normalized;

        if (eventType == null || !eventType.startsWith("ai_auto_welcome")) {
            return normalized;
        }

        String folded = Normalizer.normalize(normalized, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT);

        boolean hasBracketPlaceholder = normalized.matches(".*\\[[^\\]]{1,40}\\].*");
        boolean hasTemplateToken = folded.contains("ten ban")
                || folded.contains("ten cong ty")
                || folded.contains("name")
                || folded.contains("company");

        if (hasBracketPlaceholder || hasTemplateToken) {
            return POLITE_GENERIC_WELCOME;
        }

        return normalized;
    }

    private void dispatchAiMessageToGuest(String appId, String guestIdentity, String guestPhone, String messageText, String eventType) {
        if (appId == null || appId.isBlank() || guestIdentity == null || guestIdentity.isBlank() || messageText == null || messageText.isBlank()) {
            return;
        }

        String safeMessageText = sanitizeGuestWelcomeText(messageText, eventType);
        if (safeMessageText.isBlank()) {
            safeMessageText = POLITE_GENERIC_WELCOME;
        }

        String privateRoom = "guest:" + appId + ";" + guestIdentity;
        String masterRoom = "app:" + appId;

        ChatMessage aiMsg = new ChatMessage();
        aiMsg.setRoom(privateRoom);
        aiMsg.setUsername(AI_ASSISTANT_USERNAME);
        aiMsg.setUserId(AI_ASSISTANT_USER_ID);
        aiMsg.setIsAdmin(true);
        aiMsg.setAppId(appId);
        aiMsg.setGuestPhone(guestPhone);
        aiMsg.setGuestSessionId(guestIdentity);
        aiMsg.setEventType(eventType);
        aiMsg.setMessage(safeMessageText.length() > 280 ? safeMessageText.substring(0, 280) : safeMessageText);
        aiMsg.setTimestamp(System.currentTimeMillis());

        chatPersistenceService.saveMessage(aiMsg);
        server.getRoomOperations(privateRoom).sendEvent("message", aiMsg);
        server.getRoomOperations(masterRoom).sendEvent("message", aiMsg);

        logger.info("🤖 AI auto reply sent - appId={}, guestIdentity={}, guestPhone={}, eventType={}", appId, guestIdentity, guestPhone, eventType);
    }

    private void triggerWelcomeOnGuestJoin(String appId, String guestIdentity, String guestPhone) {
        if (appId == null || appId.isBlank() || guestIdentity == null || guestIdentity.isBlank()) return;
        if (guestPhone != null && !guestPhone.isBlank()) {
            logger.info("⏭️ Skip AI welcome because guest already has phone - appId={}, guestIdentity={}, guestPhone={}", appId, guestIdentity, guestPhone);
            return;
        }

        try {
            java.util.List<ChatMessage> existingHistory = chatPersistenceService.getHistoryByGuestIdentity(appId, guestIdentity, guestPhone, 5);
            if (existingHistory != null && !existingHistory.isEmpty()) {
                logger.info("⏭️ Skip AI welcome because guest already has chat history - appId={}, guestIdentity={}, historyCount={}", appId, guestIdentity, existingHistory.size());
                return;
            }
        } catch (Exception historyError) {
            logger.warn("Unable to inspect guest history before scheduling welcome - appId={}, guestIdentity={}, error={}", appId, guestIdentity, historyError.getMessage());
        }

        cancelGuestWelcomeTask(appId, guestIdentity);

        String key = guestKey(appId, guestIdentity);
        final String fallbackWelcome = POLITE_GENERIC_WELCOME;
        Future<?> future = chatAiScheduler.submit(() -> {
            try {
                java.util.List<ChatMessage> latestHistory = chatPersistenceService.getHistoryByGuestIdentity(appId, guestIdentity, guestPhone, 5);
                if (latestHistory != null && !latestHistory.isEmpty()) {
                    logger.info("⏭️ Skip immediate AI welcome because guest already has history - appId={}, guestIdentity={}, historyCount={}", appId, guestIdentity, latestHistory.size());
                    return;
                }

                String prompt = buildWelcomePrompt(appId, guestPhone);
                String aiRaw = aiProviderFactory.generateContent(prompt);
                String text = extractAiText(aiRaw,
                        fallbackWelcome);
                dispatchAiMessageToGuest(appId, guestIdentity, guestPhone, text, "ai_auto_welcome");
            } catch (Exception e) {
                logger.warn("Failed to send AI welcome for {}:{} - {}", appId, guestIdentity, e.getMessage());
                dispatchAiMessageToGuest(appId, guestIdentity, guestPhone, fallbackWelcome, "ai_auto_welcome_fallback");
            } finally {
                pendingGuestWelcomeTasks.remove(key);
            }
        });

        pendingGuestWelcomeTasks.put(key, future);
    }

    private boolean isLikelyAutoContactMessage(String guestMessage) {
        if (guestMessage == null || guestMessage.isBlank()) {
            return false;
        }

        String normalized = Normalizer.normalize(guestMessage, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();

        boolean hasLink = normalized.contains("http://") || normalized.contains("https://") || normalized.contains("www.");
        boolean hasContactToken = normalized.contains("so dien thoai")
                || normalized.contains("phone")
                || normalized.contains("email")
                || normalized.contains("toi quan tam den tin nay")
                || normalized.contains("i'm interested in this post")
                || normalized.contains("toi quan tam den bai viet")
                || normalized.contains("my phone number");

        return hasLink && hasContactToken;
    }

    private boolean hasRecentAutoWelcome(String appId, String guestIdentity, String guestPhone, long withinMs) {
        try {
            java.util.List<ChatMessage> history = chatPersistenceService.getHistoryByGuestIdentity(appId, guestIdentity, guestPhone, 20);
            if (history == null || history.isEmpty()) {
                return false;
            }

            long now = System.currentTimeMillis();
            for (int i = history.size() - 1; i >= 0; i--) {
                ChatMessage msg = history.get(i);
                if (msg == null) {
                    continue;
                }
                String eventType = msg.getEventType();
                Long ts = msg.getTimestamp();
                if (eventType != null && eventType.startsWith("ai_auto_welcome") && ts != null && now - ts <= withinMs) {
                    return true;
                }
            }
        } catch (Exception e) {
            logger.warn("Unable to inspect recent auto welcome for appId={}, guestIdentity={}, error={}", appId, guestIdentity, e.getMessage());
        }

        return false;
    }

    private void scheduleAutoReplyIfNoHuman(String appId, String guestIdentity, String guestPhone, String guestMessage) {
        if (appId == null || appId.isBlank() || guestIdentity == null || guestIdentity.isBlank()) return;

        // The web client may auto-send a contact/link message right after join.
        // If a welcome was just sent, skip no-reply follow-up to avoid 2 greeting-like AI messages.
        if (isLikelyAutoContactMessage(guestMessage)
                && hasRecentAutoWelcome(appId, guestIdentity, guestPhone, AUTO_WELCOME_SUPPRESSION_WINDOW_MS)) {
            logger.info("⏭️ Skip AI no-reply follow-up for auto-contact message - appId={}, guestIdentity={}", appId, guestIdentity);
            return;
        }

        cancelGuestNoReplyTask(appId, guestIdentity);

        String key = guestKey(appId, guestIdentity);
        final String fallbackFollowup = "Em da tiep nhan thong tin roi. Anh/chị cho em xin ten, so dien thoai va san pham dang quan tam de ben em lien he tu van ngay.";
        ScheduledFuture<?> future = chatAiScheduler.schedule(() -> {
            try {
                String prompt = buildNoHumanReplyPrompt(appId, guestPhone, guestMessage);
                String aiRaw = aiProviderFactory.generateContent(prompt);
                String text = extractAiText(aiRaw,
                        fallbackFollowup);
                dispatchAiMessageToGuest(appId, guestIdentity, guestPhone, text, "ai_auto_followup");
            } catch (Exception e) {
                logger.warn("Failed to send AI follow-up for {}:{} - {}", appId, guestIdentity, e.getMessage());
                dispatchAiMessageToGuest(appId, guestIdentity, guestPhone, fallbackFollowup, "ai_auto_followup_fallback");
            } finally {
                pendingGuestNoReplyTasks.remove(key);
            }
        }, AI_FOLLOWUP_DELAY_MS, TimeUnit.MILLISECONDS);

        pendingGuestNoReplyTasks.put(key, future);
    }

    // --- Hàm notifySignInToRoom được thêm vào đây ---
    /**
     * Gửi sự kiện thông báo đăng nhập đến tất cả client trong một phòng cụ thể.
     *
     * @param appId             ID của phòng mà sự kiện sẽ được gửi đến.
     * @param client            Đối tượng SocketIOClient của người dùng vừa đăng nhập
     * (để lấy sessionId).
     * @param username Tên hiển thị (username) của người dùng vừa đăng nhập.
     */
    public void notifySignInToRoom(String appId, String clientid, String username) {
        // Lấy các hoạt động (operations) cho phòng cụ thể dựa trên appId
        BroadcastOperations roomOperations = server.getRoomOperations(appId);

        // Tạo một Map để chứa thông tin client
        Map<String, String> clientInfoMap = new HashMap<>();
        clientInfoMap.put("clientId", clientid); // Lấy Session ID của client
        clientInfoMap.put("username", username);             // Gán tên hiển thị

        // Gửi sự kiện "csm_sign_in" cùng với thông tin client đến tất cả thành viên trong phòng
        roomOperations.sendEvent("csm_sign_in", clientInfoMap);

        logger.info("Sent 'csm_sign_in' event to room '{}' for client ID: {}, username: {}", 
                           appId, clientid, username);
    }
    // --- Kết thúc hàm notifySignInToRoom ---
    /**
     * Gửi sự kiện thông báo cập nhật bảng đến tất cả client trong một phòng cụ thể
     * với đầy đủ thông tin data row để client có thể update trực tiếp.
     *
     * @param appId                   ID của phòng (ứng dụng) mà sự kiện sẽ được gửi đến.
     * @param tableName               Tên của bảng đã bị thay đổi.
     * @param action                  Hành động đã xảy ra (ví dụ: "create", "update", "delete").
     * @param primaryKeysAndValues    Map chứa các cặp khóa-giá trị của khóa chính của hàng bị ảnh hưởng.
     * @param dataRow                 Full data row (cho create/update) hoặc deleted row (cho delete).
     */
    public void sendUpdateNotification(String appId, String tableName, String action,
                                    Map<String, Object> primaryKeysAndValues, Map<String, Object> dataRow) {
        try {
            // Lấy các hoạt động (operations) cho phòng cụ thể dựa trên appId
            BroadcastOperations roomOperations = server.getRoomOperations(appId);
            
            // 🔥 CRITICAL LOG: Ensure room exists and has clients
            int roomSize = server.getRoomOperations(appId).getClients().size();
            logger.info("📤 sendUpdateNotification to room '{}': table='{}', action='{}', roomSize={}, hasPrimaryKeys={}, hasDataRow={}",
                       appId, tableName, action, roomSize, (primaryKeysAndValues != null && !primaryKeysAndValues.isEmpty()), 
                       (dataRow != null && !dataRow.isEmpty()));

            // Tạo một Map để chứa tất cả thông tin bạn muốn gửi đi
            Map<String, Object> notificationData = new HashMap<>();
            notificationData.put("appId",appId); // ID ứng dụng
            notificationData.put("table", tableName);     // Tên bảng (compatible với frontend interface)
            notificationData.put("action", action);       // Hành động (compatible với frontend interface)

            // Xử lý tin nhắn mô tả hành động
            String messageText = "Table '" + tableName + "' has been ";
            if ("delete".equalsIgnoreCase(action)) {
                messageText += "deleted.";
            } else {
                messageText += action + "d.";
            }
            notificationData.put("message", messageText);     // Tin nhắn

            notificationData.put("primaryKeys", primaryKeysAndValues); // Khóa chính và giá trị của chúng
            
            // ✅ Gửi full data row để client có thể update/insert/delete trực tiếp
            if (dataRow != null && !dataRow.isEmpty()) {
                notificationData.put("dataRow", dataRow);
            }
            
            notificationData.put("success", true); // Thêm trường success nếu cần ở client


            // Gửi sự kiện "csm_msg_update" cùng với Map notificationData
            roomOperations.sendEvent("csm_msg_update", notificationData);

            logger.info("✅ Sent 'csm_msg_update' event to room '{}' for table '{}' with action '{}'. Primary Keys: {}, Has DataRow: {}",
                            appId, tableName, action, primaryKeysAndValues, (dataRow != null && !dataRow.isEmpty()));
        } catch (Exception e) {
            logger.error("❌ Error sending update notification for table {} in app {}: {}", tableName, appId, e.getMessage(), e);
        }
    }

    @PostConstruct
    public void init() {
                                // Lấy danh sách user nội bộ/app
                                server.addEventListener("chat_list_users", String.class, (client, appId, ackSender) -> {
                                    try {
                                        // Lấy tất cả user có app_id = appId
                                        net.phanmemmottrieu.data.SearchFilter filter = new net.phanmemmottrieu.data.SearchFilter();
                                        filter.setField("app_id");
                                        filter.setType("eq");
                                        filter.setValue(appId);
                                        
                                        // Get all user keys matching the filter
                                        java.util.List<String> userKeys = recordManager.searchKeys("csm", "csm_accounts", filter);
                                        
                                        // Fetch each user record using find by id
                                        java.util.List<Map<String, Object>> simplified = new java.util.ArrayList<>();
                                        for (String key : userKeys) {
                                            try {
                                                // Create filter for id field
                                                net.phanmemmottrieu.data.SearchFilter idFilter = new net.phanmemmottrieu.data.SearchFilter();
                                                idFilter.setField("id");
                                                idFilter.setType("eq");
                                                idFilter.setValue(key);
                                                
                                                Map<String, Object> user = recordManager.find("csm", "csm_accounts", idFilter);
                                                if (user != null && !user.isEmpty()) {
                                                    Map<String, Object> u = new java.util.HashMap<>();
                                                    u.put("username", user.getOrDefault("username", ""));
                                                    u.put("email", user.getOrDefault("email", ""));
                                                    u.put("phone", user.getOrDefault("phone", ""));
                                                    u.put("avatar", user.getOrDefault("avatar", ""));
                                                    u.put("userId", user.getOrDefault("id", ""));
                                                    simplified.add(u);
                                                }
                                            } catch (Exception e) {
                                                // Skip invalid user
                                                logger.warn("Failed to fetch user {}: {}", key, e.getMessage());
                                            }
                                        }
                                        
                                        ackSender.sendAckData(objectMapper.writeValueAsString(simplified));
                                    } catch (Exception e) {
                                        logger.error("❌ Error listing users for appId {}: {}", appId, e.getMessage());
                                        ackSender.sendAckData("[]");
                                    }
                                });

                                // Lấy danh sách nhóm nội bộ/app
                                server.addEventListener("chat_list_groups", String.class, (client, appId, ackSender) -> {
                                    try {
                                        // Lấy tất cả group_rights của user chính appId
                                        net.phanmemmottrieu.data.SearchFilter filter = new net.phanmemmottrieu.data.SearchFilter();
                                        filter.setField("app_id");
                                        filter.setType("eq");
                                        filter.setValue(appId);
                                        Map<String, Object> userRecord = recordManager.find("csm", "csm_accounts", filter);
                                        java.util.List<Object> groups = new java.util.ArrayList<>();
                                        if (userRecord != null && userRecord.containsKey("group_rights")) {
                                            Object gr = userRecord.get("group_rights");
                                            if (gr instanceof java.util.List<?> list) {
                                                groups = new java.util.ArrayList<>(list);
                                            }
                                        }
                                        ackSender.sendAckData(objectMapper.writeValueAsString(groups));
                                    } catch (Exception e) {
                                        ackSender.sendAckData("[]");
                                    }
                                });
                        // Tạo phòng chat mới
                        server.addEventListener("chat_create_room", String.class, (client, payload, ackSender) -> {
                            // payload: appId:roomId
                            try {
                                String[] parts = payload.split(":");
                                String appId = parts[0];
                                String roomId = parts[1];
                                net.phanmemmottrieu.data.ChatRoomManager.createRoom(appId, roomId);
                                ackSender.sendAckData("{\"success\":true}");
                            } catch (Exception e) {
                                ackSender.sendAckData("{\"success\":false,\"error\":\"Invalid payload\"}");
                            }
                        });

                        // Lấy danh sách phòng chat của app
                        server.addEventListener("chat_list_rooms", String.class, (client, appId, ackSender) -> {
                            try {
                                var rooms = net.phanmemmottrieu.data.ChatRoomManager.getRooms(appId);
                                ackSender.sendAckData(objectMapper.writeValueAsString(rooms));
                            } catch (Exception e) {
                                ackSender.sendAckData("[]");
                            }
                        });
                // Đánh dấu đã đọc toàn bộ room
                server.addEventListener("chat_mark_all_read", String.class, (client, room, ackSender) -> {
                    String userId = sessionUsernames.get(client.getSessionId());
                    if (userId != null) {
                        ChatHistoryManager.markAllAsRead(room, userId);
                        ackSender.sendAckData("{\"success\":true}");
                    } else {
                        ackSender.sendAckData("{\"success\":false,\"error\":\"No userId\"}");
                    }
                });

                // Đánh dấu đã đọc 1 tin nhắn (theo index)
                server.addEventListener("chat_mark_read", String.class, (client, payload, ackSender) -> {
                    // payload: "room:index"
                    try {
                        String[] parts = payload.split(":");
                        int idx = Integer.parseInt(parts[1]);
                        String userId = sessionUsernames.get(client.getSessionId());
                        if (userId != null) {
                            ChatHistoryManager.markMessageAsRead(idx, userId);
                            ackSender.sendAckData("{\"success\":true}");
                        } else {
                            ackSender.sendAckData("{\"success\":false,\"error\":\"No userId\"}");
                        }
                    } catch (Exception e) {
                        ackSender.sendAckData("{\"success\":false,\"error\":\"Invalid payload\"}");
                    }
                });
        logger.info("✅ SocketIOServer bean created.");
        server.addConnectListener(client -> {
            logger.info("✅ Client connected: " + client.getSessionId());
        });

        server.addDisconnectListener(client -> {
            UUID sessionId = client.getSessionId();
            String username = sessionUsernames.remove(sessionId);
            String appId = sessionAppIds.remove(sessionId);
            String guestPhone = sessionGuestPhones.remove(sessionId);
            String guestSessionId = sessionGuestSessionIds.remove(sessionId);

            String guestIdentity = firstNonBlank(guestSessionId, guestPhone);
            if (appId != null && guestIdentity != null) {
                cancelGuestWelcomeTask(appId, guestIdentity);
                cancelGuestNoReplyTask(appId, guestIdentity);
            }

            if (username != null) {
                for (Map.Entry<String, Set<UUID>> entry : roomSessions.entrySet()) {
                    String room = entry.getKey();
                    Set<UUID> sessions = entry.getValue();
                    if (sessions.remove(sessionId)) {
                        logger.info("❌ User " + username + " left room " + room);
                        server.getRoomOperations(room).sendEvent("user_left", username);
                    }
                }
            }
            if (appId != null) {
                logger.info("❌ Client disconnected from app room: " + appId + " (Session: " + sessionId + ")");
            }
        });

        server.addEventListener("join", ChatMessage.class, (client, data, ackSender) -> {
            UUID sessionId = client.getSessionId();
            String room = data.getRoom();
            String username = data.getUsername();
            String appId = data.getAppId();
            String guestPhone = data.getGuestPhone();
            String guestSessionId = data.getGuestSessionId();
            Boolean isAdmin = data.getIsAdmin();

            sessionUsernames.put(sessionId, username);
            if (appId != null && !appId.isEmpty()) {
                sessionAppIds.put(sessionId, appId);
                
                // 🚨 CRITICAL VALIDATION: Ensure appId is NOT a phone number
                if (appId.matches("^\\+?\\d[\\d\\s\\-]{7,}$")) {
                    logger.error("🚫 CRITICAL BUG in join: appId='{}' looks like a phone number! guestPhone='{}', room='{}'", 
                                appId, guestPhone, room);
                }
            }
            
            // New room structure:
            // - Guest: join "guest:{appId};{phone}" (private guest chat with admin)
            // - User: join "app:{appId}" (can chat with other users in same app)
            // - Admin: join "app:{appId}" (master room - see all messages + can broadcast)
            
            String userId = data.getUserId();
            
            if (isAdmin != null && isAdmin) {
                // Admin joins master room to see all guest + user messages
                String masterRoom = "app:" + appId;
                roomSessions.computeIfAbsent(masterRoom, r -> new CopyOnWriteArraySet<>()).add(sessionId);
                client.joinRoom(masterRoom);
                logger.info("🚪 Admin {} joined master room {} (appId: {})", username, masterRoom, appId);
                server.getRoomOperations(masterRoom).sendEvent("user_joined", username);
            } else if (firstNonBlank(guestSessionId, guestPhone) != null) {
                // Guest joins private room + master room for admin monitoring
                String guestIdentity = firstNonBlank(guestSessionId, guestPhone);
                String privateRoom = "guest:" + appId + ";" + guestIdentity;
                String masterRoom = "app:" + appId;
                sessionGuestPhones.put(sessionId, guestPhone);
                sessionGuestSessionIds.put(sessionId, guestIdentity);
                
                roomSessions.computeIfAbsent(privateRoom, r -> new CopyOnWriteArraySet<>()).add(sessionId);
                roomSessions.computeIfAbsent(masterRoom, r -> new CopyOnWriteArraySet<>()).add(sessionId);
                
                client.joinRoom(privateRoom);
                client.joinRoom(masterRoom);
                
                logger.info("🚪 Guest {} joined private room {} and master room {} (appId: {}, guestSessionId: {}, guestPhone: {})", 
                           username, privateRoom, masterRoom, appId, guestIdentity, guestPhone);
                server.getRoomOperations(privateRoom).sendEvent("user_joined", username);

                triggerWelcomeOnGuestJoin(appId, guestIdentity, guestPhone);
            } else if (userId != null && !userId.isEmpty()) {
                // Authenticated user joins app room (can chat with other users)
                String appRoom = "app:" + appId;
                roomSessions.computeIfAbsent(appRoom, r -> new CopyOnWriteArraySet<>()).add(sessionId);
                client.joinRoom(appRoom);
                logger.info("🚪 User {} (ID: {}) joined app room {} (appId: {})", username, userId, appRoom, appId);
                server.getRoomOperations(appRoom).sendEvent("user_joined", username);
            } else {
                // Fallback: join room as-is (backward compatibility)
                roomSessions.computeIfAbsent(room, r -> new CopyOnWriteArraySet<>()).add(sessionId);
                client.joinRoom(room);
                logger.info("🚪 {} joined room {} (appId: {}) [fallback]", username, room, appId);
                server.getRoomOperations(room).sendEvent("user_joined", username);
            }
        });

        // Thêm event join_room để frontend join room
        server.addEventListener("join_room", String.class, (client, room, ackSender) -> {
            UUID sessionId = client.getSessionId();
            // Lấy username từ session, nếu không có thì từ appId hoặc guest
            String username = sessionUsernames.get(sessionId);
            if (username == null) {
                // Đối với guest, set username từ appId hoặc session
                String appId = sessionAppIds.get(sessionId);
                if (appId != null) {
                    username = "Guest_" + appId; // Hoặc từ data khác
                } else {
                    username = "Guest";
                }
                sessionUsernames.put(sessionId, username);
            }
                // Lưu appId vào session nếu suy ra được từ room
                String appIdFromRoom = parseAppIdFromRoom(room);
                if (appIdFromRoom != null && !appIdFromRoom.isBlank()) {
                    sessionAppIds.put(sessionId, appIdFromRoom);
                    
                    // 🚨 CRITICAL VALIDATION: Ensure appId is NOT a phone number
                    if (appIdFromRoom.matches("^\\+?\\d[\\d\\s\\-]{7,}$")) {
                        logger.error("🚫 CRITICAL BUG in join_room: Extracted appId='{}' looks like a phone number! room='{}'", 
                                    appIdFromRoom, room);
                    }
                }
            roomSessions.computeIfAbsent(room, r -> new CopyOnWriteArraySet<>()).add(sessionId);
            client.joinRoom(room);
            logger.info("🚪 " + username + " joined room " + room + " via join_room");
        });

                            server.addEventListener("chat", ChatMessage.class, (client, data, ackSender) -> {
                                String room = data.getRoom();
                                String username = data.getUsername();
                                String message = data.getMessage();
                                String userId = data.getUserId();
                                Boolean isAdmin = data.getIsAdmin();
                                String guestPhone = data.getGuestPhone();
                                String guestSessionId = data.getGuestSessionId();
                                String appId = data.getAppId();

                                // 🔥 CRITICAL: Normalize appId FIRST before any processing
                                // Priority: appId from message > sessionAppIds > parsed room > fallback to "csm"
                                if (appId == null || appId.isBlank()) {
                                    appId = sessionAppIds.get(client.getSessionId());
                                }
                                if (appId == null || appId.isBlank()) {
                                    appId = parseAppIdFromRoom(room);
                                }
                                if (appId == null || appId.isBlank()) {
                                    appId = "csm";
                                }
                                sessionAppIds.put(client.getSessionId(), appId);
                                
                                // 🚨 CRITICAL VALIDATION: Ensure appId is NOT a phone number
                                // If appId looks like a phone number, log ERROR and use guestPhone as appId if available
                                if (appId != null && appId.matches("^\\+?\\d[\\d\\s\\-]{7,}$")) {
                                    logger.error("🚫 CRITICAL BUG: appId='{}' looks like a phone number! room='{}', guestPhone='{}', userId='{}'", 
                                                appId, room, guestPhone, userId);
                                    // If we have guestPhone, it means this might be a guest message
                                    // Try to recover: extract real appId from room if possible
                                    if (room != null && room.contains(":") && !room.matches("^\\+?\\d[\\d\\s\\-]{7,}$")) {
                                        String recoveredAppId = parseAppIdFromRoom(room);
                                        if (recoveredAppId != null && !recoveredAppId.isBlank() && !recoveredAppId.matches("^\\+?\\d[\\d\\s\\-]{7,}$")) {
                                            logger.warn("✅ Recovered appId from room: '{}' → '{}'", appId, recoveredAppId);
                                            appId = recoveredAppId;
                                        }
                                    }
                                }
                                
                                // Kiểm tra quyền: chỉ cho phép admin hoặc user nội bộ (có thể kiểm tra thêm logic tùy hệ thống)
                                boolean allow = false;
                                if (isAdmin != null && isAdmin) {
                                    // Admin luôn được phép
                                    allow = true;
                                    String targetGuestIdentity = firstNonBlank(guestSessionId, parseGuestPhoneFromRoom(room), guestPhone);
                                    if (targetGuestIdentity != null && !targetGuestIdentity.isBlank()) {
                                        cancelGuestNoReplyTask(appId, targetGuestIdentity);
                                    }
                                } else if (userId == null) {
                                    // Guest: chỉ cho phép gửi vào phòng của mình hoặc phòng app
                                    String guestAppId = appId; // appId đã được normalize ở trên
                                    if (guestAppId == null || guestAppId.isEmpty()) {
                                        guestAppId = sessionAppIds.get(client.getSessionId());
                                    } else {
                                        sessionAppIds.put(client.getSessionId(), guestAppId);
                                    }
                                    logger.info("[Chat] Guest attempting to send - room: {}, appId: {}, guestPhone: {}, guestSessionId: {}", 
                                               room, guestAppId, guestPhone, guestSessionId);
                                    
                                    // Allow guest to send to their app's rooms
                                    if (guestAppId != null && room != null && 
                                        (room.equalsIgnoreCase(guestAppId) || 
                                         room.startsWith("guest:" + guestAppId) || 
                                         room.startsWith("app:" + guestAppId))) {
                                        allow = true;
                                        logger.info("[Chat] ✅ Guest allowed to send to room: {}", room);
                                    } else {
                                        logger.warn("[Chat] ❌ Guest NOT allowed to send to room: {}", room);
                                    }

                                    if (guestAppId != null && !guestAppId.isEmpty()) {
                                        // 🔥 Set appId explicitly for database storage
                                        data.setAppId(guestAppId);
                                        appId = guestAppId;
                                    }

                                    String targetGuestIdentity = firstNonBlank(guestSessionId, parseGuestPhoneFromRoom(room), guestPhone);
                                    if (targetGuestIdentity != null && !targetGuestIdentity.isBlank()) {
                                        cancelGuestWelcomeTask(appId, targetGuestIdentity);
                                        scheduleAutoReplyIfNoHuman(appId, targetGuestIdentity, guestPhone, message);
                                    }
                                } else {
                                    // Authenticated user: cho phép chat trong app của mình
                                    allow = true;

                                    String targetGuestIdentity = firstNonBlank(guestSessionId, parseGuestPhoneFromRoom(room), guestPhone);
                                    if (targetGuestIdentity != null && !targetGuestIdentity.isBlank()) {
                                        cancelGuestNoReplyTask(appId, targetGuestIdentity);
                                    }
                                }
                                if (!allow) {
                                    logger.warn("[Chat] User {} không có quyền gửi chat nội bộ!", userId);
                                    if (ackSender != null) {
                                        ackSender.sendAckData("{\"success\":false,\"error\":\"No permission\"}");
                                    }
                                    return;
                                }

                                logger.info("💬 [" + room + "] " + username + ": " + message);
                                
                                // 🔥 CRITICAL: Ensure appId is set in message data before saving
                                if (data.getAppId() == null || data.getAppId().isBlank()) {
                                    data.setAppId(appId);
                                    logger.info("📍 [Chat] Set appId={} in message data", appId);
                                }
                                
                                // Normalize guest message data BEFORE saving
                                String guestIdentity = firstNonBlank(guestSessionId, parseGuestPhoneFromRoom(room), guestPhone);
                                if (guestIdentity != null && !guestIdentity.isEmpty()) {
                                    data.setGuestSessionId(guestIdentity);
                                }

                                if (userId == null && guestIdentity != null && !guestIdentity.isEmpty()) {
                                    // This is a guest message - ensure username is set to a stable label
                                    String guestLabel = firstNonBlank(guestPhone, guestIdentity, username, "Guest");
                                    if (username == null || username.isEmpty() || username.equals("Guest")) {
                                        data.setUsername(guestLabel);
                                        logger.info("🔧 [Chat] Normalized guest username: {} → {}", username, guestLabel);
                                    }
                                    // Ensure guestPhone is set in data
                                    if (data.getGuestPhone() == null || data.getGuestPhone().isEmpty()) {
                                        data.setGuestPhone(guestPhone);
                                    }
                                    if (data.getGuestSessionId() == null || data.getGuestSessionId().isEmpty()) {
                                        data.setGuestSessionId(guestIdentity);
                                    }
                                }
                                
                                // Thêm timestamp nếu chưa có
                                if (data.getTimestamp() == null) {
                                    data.setTimestamp(System.currentTimeMillis());
                                }
                                
                                logger.info("💾 [Chat] Saving message - appId={}, room={}, guestPhone={}, guestSessionId={}, to={}", 
                                           data.getAppId(), data.getRoom(), data.getGuestPhone(), data.getGuestSessionId(), data.getTo());
                                
                                // Lưu lịch sử chat vào các layers:
                                // 1. Memory cache (ChatHistoryManager)
                                ChatHistoryManager.saveMessage(data);
                                
                                // 2. Database với guest phone tracking (ChatPersistenceService)
                                chatPersistenceService.saveMessage(data);
                                
                                // 🆕 CRM AUTO-TRACKING: Tự động tạo customer khi guest chat
                                if (guestPhone != null && !guestPhone.isEmpty() && appId != null && !appId.isEmpty()) {
                                    try {
                                        // Extract customer name from message if provided (optional)
                                        // Format: "Tên: [Name]" hoặc "Name: [Name]" trong tin nhắn đầu tiên
                                        String customerName = username;
                                        if (customerName == null || customerName.isEmpty() || customerName.equals(guestPhone)) {
                                            // Try to extract name from message if guest introduces themselves
                                            if (message != null && (message.toLowerCase().contains("tên") || message.toLowerCase().contains("name"))) {
                                                // Basic extraction (can be improved)
                                                String[] parts = message.split(":");
                                                if (parts.length > 1) {
                                                    customerName = parts[1].trim().split("[,\\.\\n]")[0].trim();
                                                }
                                            } else {
                                                customerName = ""; // Empty name for now
                                            }
                                        }
                                        
                                        // Auto-create or update customer in CRM
                                        Map<String, Object> customerData = new HashMap<>();
                                        customerData.put("phone", guestPhone);
                                        customerData.put("name", customerName);
                                        customerData.put("email", "");
                                        customerData.put("birthday", "");
                                        customerData.put("nick_zalo", "");
                                        customerData.put("nick_facebook", "");
                                        customerData.put("status", "new");
                                        customerData.put("source", "chat");
                                        String safeMessage = message == null ? "" : message;
                                        customerData.put("notes", "First contact via chat: " + safeMessage.substring(0, Math.min(100, safeMessage.length())));

                                        crmService.createOrUpdateCustomer(appId, customerData);
                                        
                                        logger.info("✅ [CRM] Auto-created/updated customer: phone={}, appId={}, name={}", 
                                                   guestPhone, appId, customerName);
                                    } catch (Exception e) {
                                        logger.error("❌ [CRM] Error auto-creating customer from chat: {}", e.getMessage());
                                        // Don't fail chat if CRM creation fails
                                    }
                                }
                                
                                // New message routing logic:
                                String to = data.getTo();
                                
                                if (isAdmin != null && isAdmin) {
                                    // ===== ADMIN SENDING MESSAGE =====
                                    if (guestIdentity != null && !guestIdentity.isEmpty()) {
                                        // Admin → specific Guest: send to guest's private room
                                        String privateRoom = "guest:" + appId + ";" + guestIdentity;
                                        logger.info("✉️ Admin {} → Guest {} (room: {})", username, guestIdentity, privateRoom);
                                        server.getRoomOperations(privateRoom).sendEvent("message", data);
                                    } else if (to != null && !to.isEmpty()) {
                                        // Admin → specific User: send to user's private chat room
                                        String userRoom = "user:" + appId + ";" + to;
                                        logger.info("✉️ Admin {} → User {} (room: {})", username, to, userRoom);
                                        server.getRoomOperations(userRoom).sendEvent("message", data);
                                        // Also send to app room so other admins/users can see
                                        server.getRoomOperations("app:" + appId).sendEvent("message", data);
                                    } else {
                                        // Admin → Broadcast to all users in app
                                        String masterRoom = "app:" + appId;
                                        logger.info("📢 Admin {} broadcasting to app: {}", username, appId);
                                        server.getRoomOperations(masterRoom).sendEvent("message", data);
                                    }
                                    
                                } else if (guestIdentity != null && !guestIdentity.isEmpty()) {
                                    // ===== GUEST SENDING MESSAGE =====
                                    // Guest → Admin: send to master room and guest's own private room
                                    String masterRoom = "app:" + appId;
                                    String privateRoom = "guest:" + appId + ";" + guestIdentity;
                                    
                                    logger.info("✉️ Guest {} → Admin (rooms: {} + {})", guestIdentity, masterRoom, privateRoom);
                                    server.getRoomOperations(masterRoom).sendEvent("message", data);
                                    server.getRoomOperations(privateRoom).sendEvent("message", data);
                                    
                                } else if (userId != null && !userId.isEmpty()) {
                                    // ===== USER SENDING MESSAGE =====
                                    if (to != null && !to.isEmpty()) {
                                        // User → specific User: private chat
                                        String[] ids = new String[]{userId, to};
                                        java.util.Arrays.sort(ids);
                                        String privateRoom = "private:" + appId + ";" + String.join(";", ids);
                                        logger.info("✉️ User {} → User {} (room: {})", userId, to, privateRoom);
                                        
                                        // Send to private room + app room (for admin monitoring)
                                        server.getRoomOperations(privateRoom).sendEvent("message", data);
                                        server.getRoomOperations("app:" + appId).sendEvent("message", data);
                                    } else {
                                        // User → all users in app
                                        String appRoom = "app:" + appId;
                                        logger.info("✉️ User {} → App users (room: {})", userId, appRoom);
                                        server.getRoomOperations(appRoom).sendEvent("message", data);
                                    }
                                } else {
                                    // ===== FALLBACK: Legacy routing =====
                                    logger.warn("⚠️ Using legacy chat routing for room: {}", room);
                                    server.getRoomOperations(room).sendEvent("message", data);
                                }
                            });

        // Broadcast notification from CSM admin to all users of an appId
        server.addEventListener("broadcast_notification", ChatMessage.class, (client, data, ackSender) -> {
            try {
                String senderAppId = data.getAppId(); // CSM admin's appId (should be "csm")
                String targetAppId = data.getTo(); // Target appId to broadcast to
                Boolean isAdmin = data.getIsAdmin();
                String message = data.getMessage();
                String username = data.getUsername();
                
                // Verify sender is CSM admin
                if (!Boolean.TRUE.equals(isAdmin) || !"csm".equalsIgnoreCase(senderAppId)) {
                    logger.warn("⚠️ Unauthorized broadcast attempt from appId: {}, isAdmin: {}", senderAppId, isAdmin);
                    if (ackSender != null) {
                        ackSender.sendAckData("{\"success\":false,\"error\":\"Only CSM admins can broadcast notifications\"}");
                    }
                    return;
                }
                
                if (targetAppId == null || targetAppId.isEmpty()) {
                    logger.warn("⚠️ Broadcast without target appId");
                    if (ackSender != null) {
                        ackSender.sendAckData("{\"success\":false,\"error\":\"Missing target appId\"}");
                    }
                    return;
                }
                
                // 🔥 Normalize and validate target appId before storage
                String normalizedTargetAppId = (targetAppId == null || targetAppId.isBlank()) ? "csm" : targetAppId.trim();
                
                // Set timestamp and eventType
                if (data.getTimestamp() == null) {
                    data.setTimestamp(System.currentTimeMillis());
                }
                data.setEventType("broadcast_notification"); // Mark as broadcast
                data.setRoom("app:" + normalizedTargetAppId); // Set room for storage
                
                // 🔥 CRITICAL: Set appId to target appId for correct database storage
                data.setAppId(normalizedTargetAppId);
                
                logger.info("📢 Broadcasting notification - senderAppId={}, targetAppId={}, normalized={}", 
                           senderAppId, targetAppId, normalizedTargetAppId);
                
                // Persist to database with correct appId
                chatPersistenceService.saveMessage(data);
                
                // Broadcast to all users in target appId
                String broadcastRoom = "app:" + normalizedTargetAppId;
                server.getRoomOperations(broadcastRoom).sendEvent("notification", data);
                
                logger.info("📢 CSM Admin {} broadcast notification to appId: {} (room: {})",
                           username, normalizedTargetAppId, broadcastRoom);
                logger.info("   Message: {}", message.length() > 100 ? message.substring(0, 100) + "..." : message);
                
                // Send success acknowledgment
                if (ackSender != null) {
                    ackSender.sendAckData("{\"success\":true,\"targetAppId\":\"" + normalizedTargetAppId + "\",\"message\":\"Broadcast sent\"}");
                }
                
            } catch (Exception e) {
                logger.error("❌ Error in broadcast_notification handler: {}", e.getMessage(), e);
                if (ackSender != null) {
                    ackSender.sendAckData("{\"success\":false,\"error\":\"" + e.getMessage() + "\"}");
                }
            }
        });

        // Listen for typing indicators
        server.addEventListener("user_typing", java.util.Map.class, (client, data, ackSender) -> {
            try {
                String room = (String) data.get("room");
                String username = (String) data.get("username");
                String appId = (String) data.get("appId");
                Boolean isTyping = (Boolean) data.get("isTyping");
                
                if (room == null || username == null) {
                    logger.warn("Invalid typing event: missing room or username");
                    return;
                }
                
                // Broadcast typing status to all users in the room except sender
                Map<String, Object> typingEvent = new HashMap<>();
                typingEvent.put("room", room);
                typingEvent.put("username", username);
                typingEvent.put("appId", appId);
                typingEvent.put("isTyping", isTyping != null && isTyping);
                
                server.getRoomOperations(room).sendEvent("user_typing", typingEvent);
                
                logger.debug("📝 User {} is typing in room {}: {}", username, room, isTyping != null && isTyping ? "typing" : "stopped");
                
            } catch (Exception e) {
                logger.error("❌ Error in user_typing handler: {}", e.getMessage(), e);
            }
        });

        // Lấy lịch sử chat
        server.addEventListener("chat_history", String.class, (client, room, ackSender) -> {
            try {
                int limit = 50; // Số lượng tin nhắn tối đa trả về
                var history = ChatHistoryManager.getHistory(room, limit);
                ackSender.sendAckData(objectMapper.writeValueAsString(history));
            } catch (Exception e) {
                logger.error("Error getting chat history for room {}: {}", room, e.getMessage(), e);
                ackSender.sendAckData("[]");
            }
        });

        // Lấy lịch sử chat theo appId và guest identity cho guest user
        server.addEventListener("chat_history_guest", ChatMessage.class, (client, request, ackSender) -> {
            try {
                String appId = request.getAppId();
                String guestPhone = request.getGuestPhone();
                String guestSessionId = request.getGuestSessionId();
                int limit = 50;
                
                if (appId != null && ((guestSessionId != null && !guestSessionId.isEmpty()) || (guestPhone != null && !guestPhone.isEmpty()))) {
                    var history = ChatHistoryManager.getHistoryByGuestIdentity(appId, guestSessionId, guestPhone, limit);
                    ackSender.sendAckData(objectMapper.writeValueAsString(history));
                } else {
                    logger.warn("Missing appId or guest identity in chat_history_guest request");
                    ackSender.sendAckData("[]");
                }
            } catch (Exception e) {
                logger.error("Error getting guest chat history: {}", e.getMessage(), e);
                ackSender.sendAckData("[]");
            }
        });

        // Lấy tất cả lịch sử chat theo appId cho admin
        server.addEventListener("chat_history_app", String.class, (client, appId, ackSender) -> {
            try {
                int limit = 200;
                var history = ChatHistoryManager.getHistoryByAppId(appId, limit);
                ackSender.sendAckData(objectMapper.writeValueAsString(history));
            } catch (Exception e) {
                logger.error("Error getting app chat history for appId {}: {}", appId, e.getMessage(), e);
                ackSender.sendAckData("[]");
            }
        });

        // Lấy danh sách guest sessions đã chat trong appId
        server.addEventListener("chat_guests_list", String.class, (client, appId, ackSender) -> {
            try {
                var guestSessions = ChatHistoryManager.getGuestSessionsByAppId(appId);
                ackSender.sendAckData(objectMapper.writeValueAsString(guestSessions));
            } catch (Exception e) {
                logger.error("Error getting guest list for appId {}: {}", appId, e.getMessage(), e);
                ackSender.sendAckData("[]");
            }
        });

        server.addEventListener("csm_sign_in", String.class, (SocketIOClient client, String encryptedData, AckRequest ackSender) -> {
            LoginResponse response = new LoginResponse();
            response.setSuccess(false);

            try {
                String decryptedJson = recordManager.csm_decrypt(encryptedData);
                logger.info("Decrypted csm_sign_in data {}", decryptedJson);

                final LoginRequest finalData = objectMapper.readValue(decryptedJson, LoginRequest.class);

                final String loginIdentifier;

                if (finalData.getEmail() != null && !finalData.getEmail().isEmpty()) {
                    loginIdentifier = finalData.getEmail();
                } else if (finalData.getUsername() != null && !finalData.getUsername().isEmpty()) {
                    loginIdentifier = finalData.getUsername();
                } else if (finalData.getPhone() != null && !finalData.getPhone().isEmpty()) {
                    loginIdentifier = finalData.getPhone();
                } else {
                    logger.warn("No valid login identifier (email, username, or phone) provided for sign-in.");
                    response.setErrorCode(4);
                    response.setErrorErr("Vui lòng cung cấp Email, Tên đăng nhập hoặc Số điện thoại.");
                    if (ackSender != null) {
                        String jsonResponse = objectMapper.writeValueAsString(response);
                        ackSender.sendAckData(jsonResponse);
                    }
                    return;
                }

                logger.info("Attempting login for identifier: {}", loginIdentifier);

                userService.findUserByLoginIdentifierAndPassword(loginIdentifier, finalData.getPassword())
                        .ifPresentOrElse(user -> {
                            String actualUsername = user.getUsername();
                            String displayIdentifier = (actualUsername != null && !actualUsername.isEmpty()) ? actualUsername : loginIdentifier;

                            logger.info("User found: {}", displayIdentifier);

                            response.setSuccess(true);
                            response.setSocketId(client.getSessionId().toString());
                            response.setUsername(displayIdentifier);
                            response.setPermissions(user.getPermissions());
                            response.setUserAddress(user.getUserAddress());
                            response.setMenusPermissions(user.getMenusPermissions());
                            response.setAppToken(user.getAppToken());

                            if (user.getAppToken() != null && !user.getAppToken().isEmpty()) {
                                String appId = null;
                                try {
                                    appId = recordManager.csm_decrypt(user.getAppToken()).split("_____")[0];
                                } catch (Exception e) {
                                    logger.error("Error parsing app_token during sign-in for user {}: {}", displayIdentifier, e.getMessage());
                                    response.setSuccess(false);
                                    response.setErrorCode(5);
                                    response.setErrorErr("App Token của người dùng không hợp lệ.");
                                }

                                if (response.isSuccess() && appId != null && !appId.isEmpty()) {
                                    client.joinRoom(appId);
                                    notifySignInToRoom(appId,client.getSessionId().toString(),displayIdentifier);
                                    sessionAppIds.put(client.getSessionId(), appId);
                                    sessionUsernames.put(client.getSessionId(), displayIdentifier);
                                    logger.info("Client " + client.getSessionId() + " joined app room: " + appId);
                                }
                            }
                            if (ackSender != null) {
                                try {
                                    String jsonResponse = objectMapper.writeValueAsString(response);
                                    ackSender.sendAckData(jsonResponse);
                                } catch (JsonProcessingException e) {
                                    logger.error("Error converting LoginResponse to JSON string for acknowledgment (success): " + e.getMessage());
                                    ackSender.sendAckData("{\"success\":false, \"errorCode\":-1, \"errorErr\":\"Server internal error\"}");
                                }
                            } else {
                                logger.warn("ackSender is null for successful login, cannot send acknowledgment.");
                            }


                        }, () -> {
                            logger.info("Login failed for identifier: " + loginIdentifier);
                            response.setSuccess(false);
                            response.setErrorCode(0);
                            response.setErrorErr("Sai thông tin đăng nhập hoặc người dùng không tồn tại.");
                            if (ackSender != null) {
                                try {
                                    String jsonResponse = objectMapper.writeValueAsString(response);
                                    ackSender.sendAckData(jsonResponse);
                                } catch (JsonProcessingException e) {
                                    logger.error("Error converting LoginResponse to JSON string for acknowledgment (failure): " + e.getMessage());
                                    ackSender.sendAckData("{\"success\":false, \"errorCode\":-1, \"errorErr\":\"Server internal error\"}");
                                }
                            }
                        });

            } catch (JsonProcessingException jsonEx) {
                logger.error("Error deserializing decrypted LoginRequest: " + jsonEx.getMessage());
                response.setSuccess(false);
                response.setErrorCode(2);
                response.setErrorErr("Dữ liệu gửi lên không đúng định dạng: " + jsonEx.getMessage());
                if (ackSender != null) {
                    try {
                        String jsonResponse = objectMapper.writeValueAsString(response);
                        ackSender.sendAckData(jsonResponse);
                    } catch (JsonProcessingException e) {
                        logger.error("Error converting LoginResponse to JSON string for acknowledgment: " + e.getMessage());
                        ackSender.sendAckData("{\"success\":false, \"errorCode\":-1, \"errorErr\":\"Server internal error\"}");
                    }
                }
            } catch (Exception e) {
                logger.error("Error during csm_sign_in (decryption, service or other): " + e.getMessage(), e);
                response.setSuccess(false);
                response.setErrorCode(3);
                response.setErrorErr("Lỗi server không xác định: " + e.getMessage());
                if (ackSender != null) {
                    try {
                        String jsonResponse = objectMapper.writeValueAsString(response);
                        ackSender.sendAckData(jsonResponse);
                    } catch (JsonProcessingException jsonEx2) {
                        logger.error("Error converting LoginResponse to JSON string for acknowledgment: " + jsonEx2.getMessage());
                        ackSender.sendAckData("{\"success\":false, \"errorCode\":-1, \"errorErr\":\"Server internal error\"}");
                    }
                }
            }
        });

        server.addEventListener("csm_register_an_account", String.class, (SocketIOClient client, String encryptedData, AckRequest ackSender) -> {
            RegistrationResponse response = new RegistrationResponse();
            response.setSuccess(false);
            
            try {
                String decryptedJson = recordManager.csm_decrypt(encryptedData);
                logger.info("Decrypted csm_register_an_account data: " + decryptedJson);

                // Thay vì đọc vào RegistrationRequest, hãy đọc trực tiếp vào Map<String, Object>
                final Map<String, Object> userDataMap = objectMapper.readValue(decryptedJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

                // Trích xuất sourceAppToken từ Map hoặc đặt giá trị mặc định
                String app_token = (String) userDataMap.get("app_token"); // Giả sử client gửi app_token của họ trong payload
                
                if (app_token == null || app_token.isEmpty()) {
                    logger.warn("Mã giới thiệu không được cung cấp trong payload đăng ký.");
                    response.setSuccess(false);
                    response.setErrorCode(-1);
                    response.setErrorErr("Mã giới thiệu không được cung cấp trong payload đăng ký.");
                }
                
                // Đảm bảo sourceAppToken được thêm vào Map, vì registerUser giờ đây mong đợi nó ở đó
                userDataMap.put("app_token", app_token);
                // Gọi hàm registerUser với Map<String, Object>
                response = userService.registerUser(userDataMap); // <-- ĐÃ SỬA ĐỔI
            } catch (JsonProcessingException jsonEx) {
                logger.error("Error deserializing decrypted registration data to Map: " + jsonEx.getMessage());
                response.setSuccess(false);
                response.setErrorCode(2);
                response.setErrorErr("Dữ liệu đăng ký gửi lên không đúng định dạng: " + jsonEx.getMessage());
            } catch (Exception e) {
                logger.error("Error during csm_register_an_account (decryption, service or other): " + e.getMessage(), e); // Log cả stack trace
                response.setSuccess(false);
                response.setErrorCode(3);
                response.setErrorErr("Lỗi server không xác định: " + e.getMessage());
            } finally {
                if (ackSender != null) {
                    try {
                        String jsonResponse = objectMapper.writeValueAsString(response);
                        ackSender.sendAckData(jsonResponse);
                    } catch (JsonProcessingException e) {
                        logger.error("Error converting RegistrationResponse to JSON string for acknowledgment: " + e.getMessage());
                        ackSender.sendAckData("{\"success\":false, \"errorCode\":-1, \"errorErr\":\"Server internal error\"}");
                    }
                }
            }
        });

        server.addEventListener("csm_msg_update", ChatMessage.class, (client, data, ackSender) -> {
            logger.info("✉️ Received 'csm_msg_update' from " + client.getSessionId() + ": " + data.getMessage());
            server.getBroadcastOperations().sendEvent("csm_msg_update", data);
        });

        logger.info("🚀 Socket.IO server bean initialized. Waiting for ContextRefreshedEvent to start.");
    }

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (server != null && !isServerRunning) {
            try {
                // *** THÊM LOGIC BUỘC GIẢI PHÓNG CỔNG Ở ĐÂY ***
                logger.info("Attempting to ensure port {} is free before starting Socket.IO server.", socketPort);
                PortKillerUtil.killProcessOnPort(socketPort);
                // Đợi một chút để hệ điều hành hoàn tất việc giải phóng nếu có
                Thread.sleep(100); // 100ms
                // *** KẾT THÚC LOGIC BUỘC GIẢI PHÓNG CỔNG ***

                server.start();
                isServerRunning = true;
                logger.info("🚀 Socket.IO server started on port {}", socketPort);
            } catch (Exception e) {
                logger.error("❌ Failed to start Socket.IO server on port {}: {}", socketPort, e.getMessage(), e);
                // Có thể ném lại lỗi để ngăn ứng dụng khởi động nếu Socket.IO thất bại
                throw new RuntimeException("Failed to start Socket.IO server", e);
            }
        }
    }

    @PostConstruct
    public void postConstruct() {
        logger.info("✅ SocketIOConfig loaded and PostConstruct called. Port {}",socketPort);
    }
    
    @PreDestroy
    public void stopServer() {
        if (server != null && isServerRunning) {
            try {
                server.stop();
                logger.info("🛑 Socket.IO server stopped.");
            } catch (Exception e) {
                logger.error("❌ Failed to stop Socket.IO server: {}", e.getMessage(), e);
            }
        }

        try {
            chatAiScheduler.shutdownNow();
        } catch (Exception e) {
            logger.warn("Failed to shutdown chat AI scheduler: {}", e.getMessage());
        }
    }
}