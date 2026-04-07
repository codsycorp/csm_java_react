// Trong file ChatMessage.java
package net.phanmemmottrieu.model;

import java.util.Map;
import java.util.List;


public class ChatMessage {
    private String room;
    private String username;
    private String userId;
    private String avatar;
    private Boolean isAdmin;
    private String eventType; // Ví dụ: "table_update"
    private List<String> readBy; // Danh sách userId đã đọc
        public List<String> getReadBy() { return readBy; }
        public void setReadBy(List<String> readBy) { this.readBy = readBy; }
    private String tableName;
    private String action;    // Ví dụ: "created", "updated", "deleted"
    private String message;
    private Map<String, Object> primaryKeys; // Thêm trường này
    private String appId;
    private String to; // Username của người nhận (để chat riêng)
    private String guestPhone; // Số điện thoại của khách (dùng làm identifier cho guest user)
    private String guestSessionId; // Định danh phiên chat ẩn danh của khách
    private Long timestamp; // Thời gian gửi tin nhắn (milliseconds)
    private List<Map<String, Object>> attachments;
    private Map<String, Object> checkinMeta;

    // Getters and Setters
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    public Boolean getIsAdmin() { return isAdmin; }
    public void setIsAdmin(Boolean isAdmin) { this.isAdmin = isAdmin; }

    public String getRoom() {
        return room;
    }

    public void setRoom(String room) {
        this.room = room;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getTableName() {
        return tableName;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Map<String, Object> getPrimaryKeys() {
        return primaryKeys;
    }

    public void setPrimaryKeys(Map<String, Object> primaryKeys) {
        this.primaryKeys = primaryKeys;
    }

    public String getAppId() {
        return appId;
    }

    public void setAppId(String appId) {
        this.appId = appId;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getGuestPhone() {
        return guestPhone;
    }

    public void setGuestPhone(String guestPhone) {
        this.guestPhone = guestPhone;
    }

    public String getGuestSessionId() {
        return guestSessionId;
    }

    public void setGuestSessionId(String guestSessionId) {
        this.guestSessionId = guestSessionId;
    }

    public Long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Long timestamp) {
        this.timestamp = timestamp;
    }

    public List<Map<String, Object>> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<Map<String, Object>> attachments) {
        this.attachments = attachments;
    }

    public Map<String, Object> getCheckinMeta() {
        return checkinMeta;
    }

    public void setCheckinMeta(Map<String, Object> checkinMeta) {
        this.checkinMeta = checkinMeta;
    }
}