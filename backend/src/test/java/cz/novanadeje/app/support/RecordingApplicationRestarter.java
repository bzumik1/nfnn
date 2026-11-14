package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class RecordingApplicationRestarter implements ApplicationRestarter {

    public enum Kind {
        ONCE_ASYNC_WORK_IS_DONE,
        FOR_RESTORE
    }

    public record Restart(Kind kind, long asyncTasksHandedOver) {
    }

    private final AsyncTaskTracker asyncTasks;
    private final List<Restart> restarts = new CopyOnWriteArrayList<>();

    public RecordingApplicationRestarter(AsyncTaskTracker asyncTasks) {
        this.asyncTasks = asyncTasks;
    }

    @Override
    public void restartAfterCommitOnceAsyncWorkIsDone() {
        restarts.add(new Restart(Kind.ONCE_ASYNC_WORK_IS_DONE, asyncTasks.handedOver()));
    }

    @Override
    public void restartAfterCommitForRestore() {
        restarts.add(new Restart(Kind.FOR_RESTORE, asyncTasks.handedOver()));
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
