package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushPace;
import cz.novanadeje.app.operations.application.push.PushRetryTimer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.Executor;

@Component
class TaskSchedulerPushRetryTimer implements PushRetryTimer {

    private static final Logger log = LoggerFactory.getLogger(TaskSchedulerPushRetryTimer.class);

    private final TaskScheduler scheduler;
    private final Executor rounds;

    TaskSchedulerPushRetryTimer(TaskScheduler scheduler, @Qualifier("applicationTaskExecutor") Executor rounds) {
        this.scheduler = scheduler;
        this.rounds = rounds;
    }

    @Override
    public void at(Instant when, PushPace pace, Runnable retry) {
        switch (pace) {
            case AT_ONCE -> scheduler.schedule(retry, when);
            case PACED -> scheduler.schedule(() -> handOff(retry), when);
        }
    }

    private void handOff(Runnable round) {
        try {
            rounds.execute(round);
        } catch (RuntimeException rejected) {
            log.warn("Push retry round could not start: {}", rejected.getClass().getSimpleName());
        }
    }
}
