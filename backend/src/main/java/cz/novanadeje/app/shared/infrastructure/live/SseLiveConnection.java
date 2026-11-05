package cz.novanadeje.app.shared.infrastructure.live;

import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

public final class SseLiveConnection implements LiveConnection {

    private final SseEmitter emitter;

    public SseLiveConnection(Duration timeout) {
        this.emitter = new SseEmitter(timeout.toMillis());
        emitter.onTimeout(emitter::complete);
    }

    public SseEmitter emitter() {
        return emitter;
    }

    @Override
    public void send(String event, Map<String, String> data) throws IOException {
        emitter.send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
    }

    @Override
    public void heartbeat() throws IOException {
        emitter.send(SseEmitter.event().comment(""));
    }

    @Override
    public void close() {
        emitter.complete();
    }

    @Override
    public void onEnd(Runnable callback) {
        emitter.onCompletion(callback);
        emitter.onError(failure -> callback.run());
    }
}
