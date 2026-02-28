package net.phanmemmottrieu.media;

import org.kurento.client.*;
import java.util.*;

public class Room {
    private MediaPipeline pipeline;
    private List<WebRtcEndpoint> endpoints = new ArrayList<>();

    public Room(KurentoClient kurento) {
        this.pipeline = kurento.createMediaPipeline();
    }

    public WebRtcEndpoint createEndpoint() {
        WebRtcEndpoint endpoint = new WebRtcEndpoint.Builder(pipeline).build();
        endpoints.add(endpoint);
        return endpoint;
    }

    public void close() {
        pipeline.release();
    }
}