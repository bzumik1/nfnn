package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushRetryTimer;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
class TaskSchedulerPushRetryTimer implements PushRetryTimer {

    private final TaskScheduler scheduler;

    TaskSchedulerPushRetryTimer(TaskScheduler scheduler) {
        this.scheduler = scheduler;
    }

    @Override
    public void at(Instant when, Runnable task) {
        scheduler.schedule(task, when);
    }
}
