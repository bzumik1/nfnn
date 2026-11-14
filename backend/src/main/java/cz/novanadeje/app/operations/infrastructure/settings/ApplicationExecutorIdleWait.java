package cz.novanadeje.app.operations.infrastructure.settings;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.function.BooleanSupplier;

final class ApplicationExecutorIdleWait {

    interface Pause {

        void pause(Duration length) throws InterruptedException;
    }

    private static final int IDLE_POLLS_IN_A_ROW = 2;

    private static final Logger log = LoggerFactory.getLogger(ApplicationExecutorIdleWait.class);

    private final ThreadPoolTaskExecutor executor;
    private final Clock clock;
    private final Duration bound;
    private final Duration poll;
    private final Pause pause;

    ApplicationExecutorIdleWait(ThreadPoolTaskExecutor executor, Clock clock, Duration bound, Duration poll, Pause pause) {
        this.executor = executor;
        this.clock = clock;
        this.bound = bound;
        this.poll = poll;
        this.pause = pause;
    }

    Instant deadline() {
        return clock.instant().plus(bound);
    }

    boolean awaitIdle(Instant deadline, BooleanSupplier wanted) throws InterruptedException {
        int idlePolls = 0;
        while (wanted.getAsBoolean()) {
            idlePolls = idle() ? idlePolls + 1 : 0;
            if (idlePolls == IDLE_POLLS_IN_A_ROW) {
                return true;
            }
            if (!clock.instant().isBefore(deadline)) {
                log.warn("The backend restarts after waiting {} for the asynchronous tasks; running: {}, queued: {}",
                        bound, executor.getActiveCount(), executor.getQueueSize());
                return false;
            }
            pause.pause(poll);
        }
        return false;
    }

    private boolean idle() {
        return executor.getActiveCount() == 0 && executor.getQueueSize() == 0;
    }
}
