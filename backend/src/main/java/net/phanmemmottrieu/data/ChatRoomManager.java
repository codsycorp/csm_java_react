package net.phanmemmottrieu.data;

import java.util.*;

public class ChatRoomManager {
    // Map<appId, Map<roomId, Set<userId>>>
    private static final Map<String, Map<String, Set<String>>> appRooms = new HashMap<>();

    // Tạo phòng chat (nếu chưa có)
    public static void createRoom(String appId, String roomId) {
        appRooms.computeIfAbsent(appId, k -> new HashMap<>())
                .computeIfAbsent(roomId, k -> new HashSet<>());
    }

    // Thêm user vào phòng
    public static void addUserToRoom(String appId, String roomId, String userId) {
        createRoom(appId, roomId);
        appRooms.get(appId).get(roomId).add(userId);
    }

    // Lấy danh sách phòng chat của app
    public static Set<String> getRooms(String appId) {
        return appRooms.getOrDefault(appId, Collections.emptyMap()).keySet();
    }

    // Lấy danh sách user trong phòng
    public static Set<String> getUsersInRoom(String appId, String roomId) {
        return appRooms.getOrDefault(appId, Collections.emptyMap()).getOrDefault(roomId, Collections.emptySet());
    }
}
