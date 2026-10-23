package cz.novanadeje.app.operations.infrastructure.loggers;

import cz.novanadeje.app.operations.application.loggers.ResetTimer;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
class TaskSchedulerResetTimer implements ResetTimer {

    private final TaskScheduler scheduler;

    TaskSchedulerResetTimer(TaskScheduler scheduler) {
        this.scheduler = scheduler;
    }

    @Override
    public void at(Instant when, Runnable task) {
        scheduler.schedule(task, when);
    }
}
