package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.loggers.ResetTimer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class RecordingResetTimer implements ResetTimer {

    public record Scheduled(Instant when, Runnable task) {
    }

    private final List<Scheduled> scheduled = new ArrayList<>();

    @Override
    public synchronized void at(Instant when, Runnable task) {
        scheduled.add(new Scheduled(when, task));
    }

    public synchronized List<Scheduled> scheduled() {
        return List.copyOf(scheduled);
    }

    public synchronized void fireAll() {
        List<Scheduled> due = List.copyOf(scheduled);
        scheduled.clear();
        due.forEach(entry -> entry.task().run());
    }

    public synchronized void clear() {
        scheduled.clear();
    }
}
