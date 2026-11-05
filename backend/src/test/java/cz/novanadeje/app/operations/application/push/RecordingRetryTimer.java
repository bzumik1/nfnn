package cz.novanadeje.app.operations.application.push;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

class RecordingRetryTimer implements PushRetryTimer {

    record Scheduled(Instant when, Runnable task) {
    }

    private final List<Scheduled> scheduled = new ArrayList<>();

    @Override
    public void at(Instant when, Runnable task) {
        scheduled.add(new Scheduled(when, task));
    }

    List<Scheduled> scheduled() {
        return List.copyOf(scheduled);
    }

    void fireNext() {
        scheduled.removeFirst().task().run();
    }
}
