package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.push.PushRetryTimer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class RecordingPushRetryTimer implements PushRetryTimer {

    public record Scheduled(Instant when, Runnable task) {
    }

    private final List<Scheduled> scheduled = new ArrayList<>();

    @Override
    public synchronized void at(Instant when, Runnable task) {
        scheduled.add(new Scheduled(when, task));
    }

    public synchronized List<Instant> pending() {
        return scheduled.stream().map(Scheduled::when).toList();
    }

    public void fireAll() {
        List<Scheduled> due;
        synchronized (this) {
            due = List.copyOf(scheduled);
            scheduled.clear();
        }
        due.forEach(entry -> entry.task().run());
    }

    public synchronized void reset() {
        scheduled.clear();
    }
}
