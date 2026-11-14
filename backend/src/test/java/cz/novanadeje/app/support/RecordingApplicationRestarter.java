package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class RecordingApplicationRestarter implements ApplicationRestarter {

    public record Restart(long asyncTasksHandedOver) {
    }

    private final AsyncTaskTracker asyncTasks;
    private final List<Restart> restarts = new CopyOnWriteArrayList<>();

    public RecordingApplicationRestarter(AsyncTaskTracker asyncTasks) {
        this.asyncTasks = asyncTasks;
    }

    @Override
    public void restartAfterCommit() {
        restarts.add(new Restart(asyncTasks.handedOver()));
    }

    public int restarts() {
        return restarts.size();
    }

    public List<Restart> recorded() {
        return List.copyOf(restarts);
    }

    public void reset() {
        restarts.clear();
    }
}
