package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;

@Component
class ExitingApplicationRestarter implements ApplicationRestarter {

    static final Duration ASYNC_WORK_BOUND = Duration.ofMinutes(5);
    private static final Duration ASYNC_WORK_POLL = Duration.ofMillis(100);
    private static final Duration DELAY = Duration.ofSeconds(2);

    private static final Logger log = LoggerFactory.getLogger(ExitingApplicationRestarter.class);

    private final ConfigurableApplicationContext context;
    private final ApplicationExecutorIdleWait asyncWork;

    ExitingApplicationRestarter(ConfigurableApplicationContext context, @Qualifier("applicationTaskExecutor") ThreadPoolTaskExecutor executor) {
        this.context = context;
        this.asyncWork = new ApplicationExecutorIdleWait(executor, ASYNC_WORK_BOUND, ASYNC_WORK_POLL, Thread::sleep);
    }

    @Override
    public void restartAfterCommit() {
        afterCommit(() -> scheduleExit(() -> {
        }));
    }

    @Override
    public void restartAfterCommitOnceAsyncWorkIsDone() {
        afterCommit(() -> scheduleExit(asyncWork::awaitIdle));
    }

    private static void afterCommit(Runnable work) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            work.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                work.run();
            }
        });
    }

    private void scheduleExit(BeforeExit beforeExit) {
        Thread.ofPlatform().name("settings-restart").start(() -> {
            try {
                Thread.sleep(DELAY);
                beforeExit.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            log.info("Stopping the backend to apply the changed settings; Docker starts it again");
            System.exit(SpringApplication.exit(context, () -> 0));
        });
    }

    private interface BeforeExit {

        void await() throws InterruptedException;
    }
}
