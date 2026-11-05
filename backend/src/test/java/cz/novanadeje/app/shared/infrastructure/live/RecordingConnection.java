package cz.novanadeje.app.shared.infrastructure.live;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

final class RecordingConnection implements LiveConnection {

    record Sent(String event, Map<String, String> data) {
    }

    private final Duration timeout;
    private final List<Sent> sent = new CopyOnWriteArrayList<>();
    private final AtomicInteger heartbeats = new AtomicInteger();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final AtomicBoolean failing = new AtomicBoolean();
    private volatile Runnable onEnd = () -> {
    };

    RecordingConnection(Duration timeout) {
        this.timeout = timeout;
    }

    @Override
    public void send(String event, Map<String, String> data) throws IOException {
        if (failing.get()) {
            throw new IOException("client gone");
        }
        sent.add(new Sent(event, data));
    }

    @Override
    public void heartbeat() throws IOException {
        if (failing.get()) {
            throw new IOException("client gone");
        }
        heartbeats.incrementAndGet();
    }

    @Override
    public void close() {
        if (closed.compareAndSet(false, true)) {
            onEnd.run();
        }
    }

    @Override
    public void onEnd(Runnable callback) {
        onEnd = callback;
    }

    void failFromNowOn() {
        failing.set(true);
    }

    Duration timeout() {
        return timeout;
    }

    List<Sent> sent() {
        return List.copyOf(sent);
    }

    List<String> changedFeeds() {
        return sent.stream().filter(each -> each.event().equals(LiveStreamHub.CHANGED_EVENT)).map(each -> each.data().get("feed")).toList();
    }

    int heartbeats() {
        return heartbeats.get();
    }

    boolean closed() {
        return closed.get();
    }
}
