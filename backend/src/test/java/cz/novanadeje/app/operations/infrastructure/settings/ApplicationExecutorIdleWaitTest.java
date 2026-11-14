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
import cz.novanadeje.app.support.MutableClock;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ApplicationExecutorIdleWaitTest {

    private static final Duration POLL = Duration.ofMillis(5);
    private static final Duration REAL_POLL = Duration.ofMillis(50);

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-14T10:00:00Z"), ZoneOffset.UTC);
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
    @DisplayName("Given an executor with no running or queued task, when the idle wait runs, then it ends after two idle polls one pause apart and logs nothing")
    void should_end_after_two_idle_polls_when_waited_given_an_idle_executor() throws InterruptedException {
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = awaitIdleWhileWanted(new ApplicationExecutorIdleWait(executor, clock, Duration.ofMinutes(3), POLL, length -> pauses.incrementAndGet()));

        assertThat(idle).isTrue();
        assertThat(pauses).hasValue(1);
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given an executor that looks idle for one poll while a worker takes the next task, when the idle wait runs, then that poll does not count and it ends only after two idle polls in a row")
    void should_count_idle_only_after_two_idle_polls_in_a_row_when_waited_given_a_moment_of_idleness() throws InterruptedException {
        ThreadPoolTaskExecutor between = mock(ThreadPoolTaskExecutor.class);
        when(between.getActiveCount()).thenReturn(0, 1, 0, 0);
        when(between.getQueueSize()).thenReturn(0);
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = awaitIdleWhileWanted(new ApplicationExecutorIdleWait(between, clock, Duration.ofMinutes(3), POLL, length -> pauses.incrementAndGet()));

        assertThat(idle).isTrue();
        assertThat(pauses).hasValue(3);
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
        ApplicationExecutorIdleWait wait = new ApplicationExecutorIdleWait(executor, clock, Duration.ofMinutes(3), REAL_POLL, length -> {
            pausedWhileBusy.countDown();
            Thread.sleep(length);
        });

        CompletableFuture<Boolean> idle = CompletableFuture.supplyAsync(() -> awaitIdleQuietly(wait), waiting);
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
    @DisplayName("Given a task that keeps running, when the idle wait runs out of its bound on the clock, then it ends without the executor idle and one WARN names the bound and the running and queued task counts")
    void should_give_up_and_warn_when_the_bound_runs_out_given_a_task_that_keeps_running() throws InterruptedException {
        startTwoTasksThatKeepRunning();
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = awaitIdleWhileWanted(new ApplicationExecutorIdleWait(executor, clock, POLL.multipliedBy(3), POLL, length -> {
            pauses.incrementAndGet();
            clock.advance(length);
        }));

        assertThat(idle).isFalse();
        assertThat(pauses).hasValue(3);
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The backend restarts after waiting PT0.015S for the asynchronous tasks; running: 1, queued: 1");
        });
    }

    @Test
    @DisplayName("Given pauses that last longer than the poll, when the idle wait runs, then it gives up once the deadline on the clock passed rather than after a number of pauses")
    void should_give_up_at_the_deadline_on_the_clock_when_waited_given_pauses_longer_than_the_poll() throws InterruptedException {
        startTwoTasksThatKeepRunning();
        AtomicInteger pauses = new AtomicInteger();

        boolean idle = awaitIdleWhileWanted(new ApplicationExecutorIdleWait(executor, clock, POLL.multipliedBy(4), POLL, length -> {
            pauses.incrementAndGet();
            clock.advance(length.multipliedBy(2));
        }));

        assertThat(idle).isFalse();
        assertThat(pauses).hasValue(2);
    }

    @Test
    @DisplayName("Given a task that keeps running, when the one waiting no longer wants the wait, then it ends at the next poll without the executor idle and logs nothing")
    void should_end_at_the_next_poll_without_a_warn_when_no_longer_wanted_given_a_task_that_keeps_running() throws InterruptedException {
        startTwoTasksThatKeepRunning();
        AtomicInteger pauses = new AtomicInteger();
        ApplicationExecutorIdleWait wait = new ApplicationExecutorIdleWait(executor, clock, Duration.ofMinutes(3), POLL, length -> pauses.incrementAndGet());

        boolean idle = wait.awaitIdle(wait.deadline(), () -> pauses.get() < 2);

        assertThat(idle).isFalse();
        assertThat(pauses).hasValue(2);
        assertThat(lines.list).isEmpty();
    }

    private static boolean awaitIdleWhileWanted(ApplicationExecutorIdleWait wait) throws InterruptedException {
        return wait.awaitIdle(wait.deadline(), () -> true);
    }

    private void startTwoTasksThatKeepRunning() throws InterruptedException {
        executor.execute(() -> {
            firstStarted.countDown();
            awaitQuietly(releaseFirst);
        });
        executor.execute(() -> awaitQuietly(releaseSecond));
        assertThat(firstStarted.await(10, TimeUnit.SECONDS)).isTrue();
    }

    private static boolean awaitIdleQuietly(ApplicationExecutorIdleWait wait) {
        try {
            return awaitIdleWhileWanted(wait);
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
