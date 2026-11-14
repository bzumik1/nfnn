package cz.novanadeje.app.operations.infrastructure.settings;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExitingApplicationRestarterTest {

    private static final Instant START = Instant.parse("2026-11-14T10:00:00Z");
    private static final Duration KEY_CARD_WATCH = Duration.ofSeconds(3).multipliedBy(100);
    private static final Duration STOP = Duration.ofSeconds(20);
    private static final Duration START_UP = Duration.ofMinutes(1);

    private final MutableClock clock = new MutableClock(START, ZoneOffset.UTC);
    private final ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    private final CountDownLatch taskStarted = new CountDownLatch(1);
    private final CountDownLatch releaseTask = new CountDownLatch(1);
    private final AtomicInteger exits = new AtomicInteger();
    private final List<String> steps = new CopyOnWriteArrayList<>();
    private final List<Runnable> restartThreads = new CopyOnWriteArrayList<>();
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void startExecutorAndCaptureLogs() {
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.initialize();
        lines.start();
        logger(ExitingApplicationRestarter.class).addAppender(lines);
        logger(ApplicationExecutorIdleWait.class).addAppender(lines);
    }

    @AfterEach
    void stopEverything() {
        releaseTask.countDown();
        executor.shutdown();
        logger(ExitingApplicationRestarter.class).detachAppender(lines);
        logger(ApplicationExecutorIdleWait.class).detachAppender(lines);
    }

    @Test
    @DisplayName("Given a task running on the application executor, when a restart is asked for, then the backend exits only once the task has ended and the executor is idle")
    void should_exit_only_once_the_executor_is_idle_when_restarted_given_a_running_task() throws Exception {
        executor.execute(() -> {
            taskStarted.countDown();
            awaitQuietly(releaseTask);
            steps.add("task ended");
        });
        assertThat(taskStarted.await(10, TimeUnit.SECONDS)).isTrue();
        CountDownLatch polledWhileBusy = new CountDownLatch(3);
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, length -> {
            clock.advance(length);
            if (length.equals(ExitingApplicationRestarter.ASYNC_WORK_POLL)) {
                polledWhileBusy.countDown();
                Thread.sleep(1);
            }
        }, restartThreads::add, this::exit);

        restarter.restartAfterCommit();
        CompletableFuture<Void> restart = CompletableFuture.runAsync(restartThreads.getFirst());
        assertThat(polledWhileBusy.await(10, TimeUnit.SECONDS)).isTrue();
        int exitsWhileBusy = exits.get();
        releaseTask.countDown();
        restart.get(10, TimeUnit.SECONDS);

        assertThat(exitsWhileBusy).isZero();
        assertThat(steps).containsExactly("task ended", "exit");
        assertThat(lines.list).extracting(ILoggingEvent::getFormattedMessage)
                .containsExactly("Stopping the backend to apply the changed settings; Docker starts it again");
    }

    @Test
    @DisplayName("Given a task that keeps running, when a restart is asked for, then the backend exits once the bound measured on the clock ran out and a WARN names the bound and the running and queued task counts")
    void should_exit_after_the_bound_with_a_warn_when_restarted_given_a_task_that_keeps_running() throws InterruptedException {
        executor.execute(() -> {
            taskStarted.countDown();
            awaitQuietly(releaseTask);
        });
        executor.execute(() -> awaitQuietly(releaseTask));
        assertThat(taskStarted.await(10, TimeUnit.SECONDS)).isTrue();
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, Runnable::run, this::exit);

        restarter.restartAfterCommit();

        assertThat(exits).hasValue(1);
        assertThat(Duration.between(START, clock.instant()))
                .isGreaterThanOrEqualTo(ExitingApplicationRestarter.DELAY.plus(ExitingApplicationRestarter.ASYNC_WORK_BOUND))
                .isLessThan(ExitingApplicationRestarter.DELAY.plus(ExitingApplicationRestarter.ASYNC_WORK_BOUND).plus(ExitingApplicationRestarter.ASYNC_WORK_POLL));
        assertThat(lines.list).hasSize(2);
        assertThat(lines.list.getFirst()).satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The backend restarts after waiting PT3M for the asynchronous tasks; running: 1, queued: 1");
        });
    }

    @Test
    @DisplayName("Given an executor whose counts cannot be read, when a restart is asked for, then the backend exits anyway and a WARN names only the exception's class")
    void should_exit_anyway_with_a_warn_when_restarted_given_the_wait_throws() {
        ThreadPoolTaskExecutor broken = mock(ThreadPoolTaskExecutor.class);
        when(broken.getActiveCount()).thenThrow(new IllegalStateException("ThreadPoolTaskExecutor not initialized"));
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(broken, clock, clock::advance, Runnable::run, this::exit);

        restarter.restartAfterCommit();

        assertThat(exits).hasValue(1);
        assertThat(lines.list.getFirst()).satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The wait for the asynchronous tasks failed (IllegalStateException), so the backend restarts without it");
        });
    }

    @Test
    @DisplayName("Given a restart pending, when another restart is asked for, then it joins the pending one: one restart thread starts and the backend exits once")
    void should_join_the_pending_restart_when_asked_again_given_a_restart_pending() {
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, restartThreads::add, this::exit);

        restarter.restartAfterCommit();
        restarter.restartAfterCommit();
        restartThreads.forEach(Runnable::run);

        assertThat(restartThreads).hasSize(1);
        assertThat(exits).hasValue(1);
        assertThat(lines.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                "A restart is already pending and applies this change too",
                "Stopping the backend to apply the changed settings; Docker starts it again");
    }

    @Test
    @DisplayName("Given the key card watching 100 polls 3 s apart for the new key, when the restart's delay, bound and the 20 s stop are added up, then at least a minute is left for the start, so the card normally sees the restart")
    void should_leave_the_key_card_a_minute_for_the_start_when_added_up_given_its_watch() {
        Duration beforeTheStart = ExitingApplicationRestarter.DELAY.plus(ExitingApplicationRestarter.ASYNC_WORK_BOUND).plus(STOP);

        assertThat(ExitingApplicationRestarter.ASYNC_WORK_BOUND).isEqualTo(Duration.ofMinutes(3));
        assertThat(beforeTheStart.plus(START_UP)).isLessThanOrEqualTo(KEY_CARD_WATCH);
    }

    private void exit() {
        steps.add("exit");
        exits.incrementAndGet();
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static Logger logger(Class<?> owner) {
        return (Logger) LoggerFactory.getLogger(owner);
    }
}
