package cz.novanadeje.app.operations.infrastructure.settings;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;

final class ApplicationExecutorIdleWait {

    interface Pause {

        void pause(Duration length) throws InterruptedException;
    }

    private static final Logger log = LoggerFactory.getLogger(ApplicationExecutorIdleWait.class);

    private final ThreadPoolTaskExecutor executor;
    private final Duration bound;
    private final Duration poll;
    private final Pause pause;

    ApplicationExecutorIdleWait(ThreadPoolTaskExecutor executor, Duration bound, Duration poll, Pause pause) {
        this.executor = executor;
        this.bound = bound;
        this.poll = poll;
        this.pause = pause;
    }

    boolean awaitIdle() throws InterruptedException {
        long pausesLeft = bound.dividedBy(poll);
        while (!idle()) {
            if (pausesLeft == 0) {
                log.warn("The backend restarts with {} asynchronous tasks running and {} queued after waiting {} for them to finish",
                        executor.getActiveCount(), executor.getQueueSize(), bound);
                return false;
            }
            pause.pause(poll);
            pausesLeft--;
        }
        return true;
    }

    private boolean idle() {
        return executor.getActiveCount() == 0 && executor.getQueueSize() == 0;
    }
}
