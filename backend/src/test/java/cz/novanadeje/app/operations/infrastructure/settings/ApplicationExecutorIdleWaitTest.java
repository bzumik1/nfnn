package cz.novanadeje.app.operations.infrastructure.settings;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class ApplicationExecutorIdleWaitTest {

    private static final Duration POLL = Duration.ofMillis(5);

    private final ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    private final ExecutorService waiting = Executors.newSingleThreadExecutor();
    private final CountDownLatch releaseFirst = new CountDownLatch(1);
    private final CountDownLatch releaseSecond = new CountDownLatch(1);
    private final CountDownLatch firstStarted = new CountDownLatch(1);
    private final CountDownLatch secondStarted = new CountDownLatch(1);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void startExecutorAndCaptureLog() {
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.initialize();
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void stopEverything() {
        releaseFirst.countDown();
        releaseSecond.countDown();
        executor.shutdown();
        waiting.shutdownNow();
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given an executor with no running or queued task, when the idle wait runs, then it ends at once without pausing and logs nothing")
    void should_end_at_once_when_waited_given_an_idle_executor() throws InterruptedException {
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = new ApplicationExecutorIdleWait(executor, Duration.ofMinutes(5), POLL, length -> pauses.incrementAndGet()).awaitIdle();

        assertThat(idle).isTrue();
        assertThat(pauses).hasValue(0);
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given one task running and one queued behind it, when the idle wait runs, then it keeps waiting after the running task ends and while the queued one runs, and ends once that one is done")
    void should_wait_through_the_running_and_the_queued_task_when_waited_given_a_busy_executor() throws Exception {
        executor.execute(() -> {
            firstStarted.countDown();
            awaitQuietly(releaseFirst);
        });
        executor.execute(() -> {
            secondStarted.countDown();
            awaitQuietly(releaseSecond);
        });
        assertThat(firstStarted.await(10, TimeUnit.SECONDS)).isTrue();
        CountDownLatch pausedWhileBusy = new CountDownLatch(1);
        ApplicationExecutorIdleWait wait = new ApplicationExecutorIdleWait(executor, Duration.ofMinutes(5), POLL, length -> {
            pausedWhileBusy.countDown();
            Thread.sleep(length);
        });

        CompletableFuture<Boolean> idle = CompletableFuture.supplyAsync(() -> awaitIdle(wait), waiting);
        assertThat(pausedWhileBusy.await(10, TimeUnit.SECONDS)).isTrue();
        releaseFirst.countDown();
        assertThat(secondStarted.await(10, TimeUnit.SECONDS)).isTrue();
        boolean endedWhileTheQueuedTaskRan = idle.isDone();
        releaseSecond.countDown();

        assertThat(endedWhileTheQueuedTaskRan).isFalse();
        assertThat(idle.get(10, TimeUnit.SECONDS)).isTrue();
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given a task that keeps running, when the idle wait runs out of its bound, then it ends without the executor idle and one WARN names the running and queued task counts and the bound")
    void should_give_up_and_warn_when_the_bound_runs_out_given_a_task_that_keeps_running() throws InterruptedException {
        executor.execute(() -> {
            firstStarted.countDown();
            awaitQuietly(releaseFirst);
        });
        executor.execute(() -> awaitQuietly(releaseSecond));
        assertThat(firstStarted.await(10, TimeUnit.SECONDS)).isTrue();
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = new ApplicationExecutorIdleWait(executor, POLL.multipliedBy(3), POLL, length -> pauses.incrementAndGet()).awaitIdle();

        assertThat(idle).isFalse();
        assertThat(pauses).hasValue(3);
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The backend restarts with 1 asynchronous tasks running and 1 queued after waiting PT0.015S for them to finish");
        });
    }

    private static boolean awaitIdle(ApplicationExecutorIdleWait wait) {
        try {
            return wait.awaitIdle();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ApplicationExecutorIdleWait.class);
    }
}
