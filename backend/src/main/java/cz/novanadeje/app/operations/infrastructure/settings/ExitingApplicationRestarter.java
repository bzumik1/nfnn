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
import java.time.Instant;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

@Component
class ExitingApplicationRestarter implements ApplicationRestarter {

    static final Duration DELAY = Duration.ofSeconds(2);
    static final Duration ASYNC_WORK_BOUND = Duration.ofMinutes(3);
    static final Duration ASYNC_WORK_POLL = Duration.ofMillis(100);

    interface Exit {

        void exit();
    }

    private enum Phase {
        NONE,
        WAITING,
        EXITING
    }

    private record Pending(Phase phase, int joins) {

        static final Pending NONE = new Pending(Phase.NONE, 0);
        static final Pending WAITING = new Pending(Phase.WAITING, 0);
        static final Pending EXITING = new Pending(Phase.EXITING, 0);

        boolean waiting() {
            return phase == Phase.WAITING;
        }

        Pending joined() {
            return new Pending(phase, joins + 1);
        }
    }

    private static final Logger log = LoggerFactory.getLogger(ExitingApplicationRestarter.class);

    private final AtomicReference<Pending> pending = new AtomicReference<>(Pending.NONE);
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
    public void restartAfterCommitOnceAsyncWorkIsDone() {
        afterCommit(this::restartOnceAsyncWorkIsDone);
    }

    @Override
    public void restartAfterCommitForRestore() {
        afterCommit(this::restartForRestore);
    }

    private static void afterCommit(Runnable restart) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            restart.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                restart.run();
            }
        });
    }

    private void restartOnceAsyncWorkIsDone() {
        Pending before = pending.getAndUpdate(current -> switch (current.phase()) {
            case NONE -> Pending.WAITING;
            case WAITING -> current.joined();
            case EXITING -> current;
        });
        switch (before.phase()) {
            case NONE -> start(this::exitOnceAsyncWorkIsDone);
            case WAITING -> log.info("A restart is already pending and applies this change too");
            case EXITING -> warnAlreadyExiting();
        }
    }

    private void restartForRestore() {
        Pending before = pending.getAndSet(Pending.EXITING);
        switch (before.phase()) {
            case NONE -> start(this::exitAfterTheDelay);
            case WAITING -> log.warn("A restore ended the wait for the asynchronous tasks, which may be cut off");
            case EXITING -> warnAlreadyExiting();
        }
    }

    private static void warnAlreadyExiting() {
        log.warn("A restart is already stopping the backend, so the asynchronous tasks of this change may be cut off");
    }

    private void start(Runnable work) {
        try {
            restartThread.execute(work);
        } catch (RuntimeException | Error failure) {
            pending.set(Pending.NONE);
            throw failure;
        }
    }

    private void exitAfterTheDelay() {
        try {
            pause.pause(DELAY);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } finally {
            exitNow();
        }
    }

    private void exitOnceAsyncWorkIsDone() {
        try {
            pause.pause(DELAY);
            awaitAsyncWork();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException failure) {
            log.warn("The wait for the asynchronous tasks failed ({}), so the backend restarts without it", failure.getClass().getSimpleName());
        } finally {
            exitNow();
        }
    }

    private void awaitAsyncWork() throws InterruptedException {
        Instant deadline = asyncWork.deadline();
        Pending seen = pending.get();
        while (seen.waiting() && asyncWork.awaitIdle(deadline, () -> pending.get().waiting())) {
            if (pending.compareAndSet(seen, Pending.EXITING)) {
                return;
            }
            seen = pending.get();
        }
    }

    private void exitNow() {
        pending.set(Pending.EXITING);
        log.info("Stopping the backend to apply the changed settings; Docker starts it again");
        exit.exit();
    }
}
