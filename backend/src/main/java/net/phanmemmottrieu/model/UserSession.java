package net.phanmemmottrieu.model;

public class UserSession {
    private String sessionId;
    private String roomId;
    // thêm các trường khác nếu cần

    public UserSession(String sessionId, String roomId) {
        this.sessionId = sessionId;
        this.roomId = roomId;
    }
    public String getSessionId() { return sessionId; }
    public String getRoomId() { return roomId; }
}