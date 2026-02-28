package net.phanmemmottrieu.media;

import org.kurento.client.MediaPipeline;
import org.kurento.client.RecorderEndpoint;

public class RecorderManager {
    private RecorderEndpoint recorder;

    public RecorderManager(MediaPipeline pipeline, String uri) {
        recorder = new RecorderEndpoint.Builder(pipeline, uri).build();
    }

    public void start() {
        recorder.record();
    }

    public void stop() {
        recorder.stop();
    }
}