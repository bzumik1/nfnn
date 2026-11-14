package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
class ExitingApplicationRestarter implements ApplicationRestarter {

    static final Duration DELAY = Duration.ofSeconds(2);
    static final Duration ASYNC_WORK_BOUND = Duration.ofMinutes(3);
    static final Duration ASYNC_WORK_POLL = Duration.ofMillis(100);

    interface Exit {

        void exit();
    }

    private static final Logger log = LoggerFactory.getLogger(ExitingApplicationRestarter.class);

    private final AtomicBoolean pending = new AtomicBoolean();
    private final ApplicationExecutorIdleWait asyncWork;
    private final ApplicationExecutorIdleWait.Pause pause;
    private final Executor restartThread;
    private final Exit exit;

    @Autowired
    ExitingApplicationRestarter(ConfigurableApplicationContext context, @Qualifier("applicationTaskExecutor") ThreadPoolTaskExecutor executor, Clock clock) {
        this(executor, clock, Thread::sleep, work -> Thread.ofPlatform().name("settings-restart").start(work),
                () -> System.exit(SpringApplication.exit(context, () -> 0)));
    }

    ExitingApplicationRestarter(ThreadPoolTaskExecutor executor, Clock clock, ApplicationExecutorIdleWait.Pause pause, Executor restartThread, Exit exit) {
        this.asyncWork = new ApplicationExecutorIdleWait(executor, clock, ASYNC_WORK_BOUND, ASYNC_WORK_POLL, pause);
        this.pause = pause;
        this.restartThread = restartThread;
        this.exit = exit;
    }

    @Override
    public void restartAfterCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            scheduleExit();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                scheduleExit();
            }
        });
    }

    private void scheduleExit() {
        if (!pending.compareAndSet(false, true)) {
            log.info("A restart is already pending and applies this change too");
            return;
        }
        restartThread.execute(this::exitOnceAsyncWorkIsDone);
    }

    private void exitOnceAsyncWorkIsDone() {
        try {
            pause.pause(DELAY);
            asyncWork.awaitIdle();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException failure) {
            log.warn("The wait for the asynchronous tasks failed ({}), so the backend restarts without it", failure.getClass().getSimpleName());
        }
        log.info("Stopping the backend to apply the changed settings; Docker starts it again");
        exit.exit();
    }
}
