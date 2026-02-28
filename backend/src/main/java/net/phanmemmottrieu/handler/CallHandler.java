package net.phanmemmottrieu.handler;

import org.kurento.client.KurentoClient;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.media.Room;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class CallHandler {
    private final KurentoClient kurento;
    private final ConcurrentHashMap<String, Room> rooms = new ConcurrentHashMap<>();

    public CallHandler(KurentoClient kurento) {
        this.kurento = kurento;
    }

    public Room getOrCreateRoom(String roomId) {
        return rooms.computeIfAbsent(roomId, k -> new Room(kurento));
    }
}
