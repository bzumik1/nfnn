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
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExitingApplicationRestarterTest {

    private static final Instant START = Instant.parse("2026-11-14T10:00:00Z");
    private static final Duration KEY_CARD_WATCH = Duration.ofSeconds(3).multipliedBy(100);
    private static final Duration STOP = Duration.ofSeconds(20);
    private static final Duration START_UP = Duration.ofMinutes(1);
    private static final String STOPPING = "Stopping the backend to apply the changed settings; Docker starts it again";
    private static final String JOINED = "A restart is already pending and applies this change too";
    private static final String JOINED_WHILE_EXITING = "A restart is already stopping the backend, so the asynchronous tasks of this change may be cut off";
    private static final String RESTORE_ENDED_THE_WAIT = "A restore ended the wait for the asynchronous tasks, which may be cut off";

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
    @DisplayName("Given a task running on the application executor, when a restart once the async work is done is asked for, then the backend exits only once the task has ended and the executor is idle")
    void should_exit_only_once_the_executor_is_idle_when_restarted_given_a_running_task() throws Exception {
        startTaskThatWaitsForRelease();
        CountDownLatch polledWhileBusy = new CountDownLatch(3);
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, length -> {
            if (length.equals(ExitingApplicationRestarter.ASYNC_WORK_POLL)) {
                polledWhileBusy.countDown();
                Thread.sleep(1);
            } else {
                clock.advance(length);
            }
        }, restartThreads::add, this::exit);

        restarter.restartAfterCommitOnceAsyncWorkIsDone();
        CompletableFuture<Void> restart = CompletableFuture.runAsync(restartThreads.getFirst());
        assertThat(polledWhileBusy.await(10, TimeUnit.SECONDS)).isTrue();
        int exitsWhileBusy = exits.get();
        releaseTask.countDown();
        restart.get(10, TimeUnit.SECONDS);

        assertThat(exitsWhileBusy).isZero();
        assertThat(steps).containsExactly("task ended", "exit");
        assertThat(messages()).containsExactly(STOPPING);
    }

    @Test
    @DisplayName("Given a task running on the application executor and no restart pending, when a restore asks for a restart, then the backend exits after the 2 s delay without waiting for the task and logs no WARN")
    void should_exit_after_the_delay_without_waiting_when_a_restore_restarts_given_a_running_task() throws InterruptedException {
        startTaskThatWaitsForRelease();
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, Runnable::run, this::exit);

        restarter.restartAfterCommitForRestore();

        assertThat(exits).hasValue(1);
        assertThat(steps).containsExactly("exit");
        assertThat(Duration.between(START, clock.instant())).isEqualTo(ExitingApplicationRestarter.DELAY);
        assertThat(messages()).containsExactly(STOPPING);
    }

    @Test
    @DisplayName("Given a restart waiting for a task that keeps running, when a restore asks for a restart, then the wait ends at once, the backend exits once without the task ending and a WARN says the restore ended the wait")
    void should_end_the_wait_at_once_with_a_warn_when_a_restore_restarts_given_a_restart_waiting() throws Exception {
        startTaskThatWaitsForRelease();
        CountDownLatch polledWhileBusy = new CountDownLatch(3);
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, length -> {
            if (length.equals(ExitingApplicationRestarter.ASYNC_WORK_POLL)) {
                polledWhileBusy.countDown();
                Thread.sleep(1);
            } else {
                clock.advance(length);
            }
        }, restartThreads::add, this::exit);

        restarter.restartAfterCommitOnceAsyncWorkIsDone();
        CompletableFuture<Void> restart = CompletableFuture.runAsync(restartThreads.getFirst());
        assertThat(polledWhileBusy.await(10, TimeUnit.SECONDS)).isTrue();
        restarter.restartAfterCommitForRestore();
        restart.get(10, TimeUnit.SECONDS);

        assertThat(restartThreads).hasSize(1);
        assertThat(exits).hasValue(1);
        assertThat(steps).containsExactly("exit");
        assertThat(Duration.between(START, clock.instant())).isLessThan(ExitingApplicationRestarter.ASYNC_WORK_BOUND);
        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage).containsExactlyInAnyOrder(
                tuple(Level.WARN, RESTORE_ENDED_THE_WAIT),
                tuple(Level.INFO, STOPPING));
    }

    @Test
    @DisplayName("Given a task that keeps running, when a restart once the async work is done is asked for, then the backend exits once the bound measured on the clock ran out and a WARN names the bound and the running and queued task counts")
    void should_exit_after_the_bound_with_a_warn_when_restarted_given_a_task_that_keeps_running() throws InterruptedException {
        startTaskThatWaitsForRelease();
        executor.execute(() -> awaitQuietly(releaseTask));
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, Runnable::run, this::exit);

        restarter.restartAfterCommitOnceAsyncWorkIsDone();

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
    @DisplayName("Given an executor whose counts cannot be read, when a restart once the async work is done is asked for, then the backend exits anyway and a WARN names only the exception's class")
    void should_exit_anyway_with_a_warn_when_restarted_given_the_wait_throws() {
        ThreadPoolTaskExecutor broken = mock(ThreadPoolTaskExecutor.class);
        when(broken.getActiveCount()).thenThrow(new IllegalStateException("ThreadPoolTaskExecutor not initialized"));
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(broken, clock, clock::advance, Runnable::run, this::exit);

        restarter.restartAfterCommitOnceAsyncWorkIsDone();

        assertThat(exits).hasValue(1);
        assertThat(lines.list.getFirst()).satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The wait for the asynchronous tasks failed (IllegalStateException), so the backend restarts without it");
        });
    }

    @Test
    @DisplayName("Given a wait that throws an Error, when a restart once the async work is done is asked for, then the backend still exits and the Error goes on")
    void should_exit_and_rethrow_when_restarted_given_the_wait_throws_an_error() {
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, length -> {
            if (length.equals(ExitingApplicationRestarter.ASYNC_WORK_POLL)) {
                throw new OutOfMemoryError("Java heap space");
            }
        }, Runnable::run, this::exit);

        assertThatThrownBy(restarter::restartAfterCommitOnceAsyncWorkIsDone).isInstanceOf(OutOfMemoryError.class);

        assertThat(exits).hasValue(1);
    }

    @Test
    @DisplayName("Given the restart thread cannot be started, when a restart is asked for, then the failure goes on and the next restart asked for starts its thread and exits")
    void should_let_the_next_restart_start_when_restarted_given_the_restart_thread_could_not_start() {
        AtomicInteger starts = new AtomicInteger();
        Executor failingOnce = work -> {
            if (starts.getAndIncrement() < 1) {
                throw new OutOfMemoryError("unable to create native thread");
            }
            work.run();
        };
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, failingOnce, this::exit);

        assertThatThrownBy(restarter::restartAfterCommitOnceAsyncWorkIsDone).isInstanceOf(OutOfMemoryError.class);
        int exitsAfterTheFailure = exits.get();
        restarter.restartAfterCommitOnceAsyncWorkIsDone();

        assertThat(exitsAfterTheFailure).isZero();
        assertThat(exits).hasValue(1);
        assertThat(messages()).containsExactly(STOPPING);
    }

    @Test
    @DisplayName("Given the restart thread cannot be started, when a restore asks for a restart, then the backend exits on the caller's thread and the failure goes on, so a restore never leaves the backend running")
    void should_exit_on_the_callers_thread_when_a_restore_restarts_given_the_restart_thread_could_not_start() {
        Executor failing = work -> {
            throw new OutOfMemoryError("unable to create native thread");
        };
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, failing, this::exit);

        assertThatThrownBy(restarter::restartAfterCommitForRestore).isInstanceOf(OutOfMemoryError.class);

        assertThat(exits).hasValue(1);
        assertThat(messages()).containsExactly(STOPPING);
    }

    @Test
    @DisplayName("Given a restart pending, when another restart is asked for, then it joins the pending one: one restart thread starts and the backend exits once")
    void should_join_the_pending_restart_when_asked_again_given_a_restart_pending() {
        ExitingApplicationRestarter restarter = new ExitingApplicationRestarter(executor, clock, clock::advance, restartThreads::add, this::exit);

        restarter.restartAfterCommitOnceAsyncWorkIsDone();
        restarter.restartAfterCommitOnceAsyncWorkIsDone();
        restartThreads.forEach(Runnable::run);

        assertThat(restartThreads).hasSize(1);
        assertThat(exits).hasValue(1);
        assertThat(messages()).containsExactly(JOINED, STOPPING);
    }

    @Test
    @DisplayName("Given a change that joins the pending restart while its wait sees the executor idle, when its tasks are queued just before it joins, then the restarter waits again until they are done before it exits")
    void should_wait_again_when_a_change_joins_during_the_idle_polls_given_its_tasks_queued() {
        ThreadPoolTaskExecutor counted = mock(ThreadPoolTaskExecutor.class);
        AtomicReference<ExitingApplicationRestarter> restarter = new AtomicReference<>();
        AtomicInteger polls = new AtomicInteger();
        when(counted.getQueueSize()).thenReturn(0);
        when(counted.getActiveCount()).thenAnswer(call -> switch (polls.incrementAndGet()) {
            case 2 -> {
                restarter.get().restartAfterCommitOnceAsyncWorkIsDone();
                yield 0;
            }
            case 3 -> 1;
            default -> 0;
        });
        restarter.set(new ExitingApplicationRestarter(counted, clock, clock::advance, Runnable::run, this::exit));

        restarter.get().restartAfterCommitOnceAsyncWorkIsDone();

        assertThat(exits).hasValue(1);
        assertThat(polls).hasValue(5);
        assertThat(messages()).containsExactly(JOINED, STOPPING);
    }

    @Test
    @DisplayName("Given a restart past its wait and stopping the backend, when another change or a restore asks for a restart, then neither starts a second exit and each logs a WARN that its asynchronous tasks may be cut off")
    void should_warn_without_a_second_exit_when_asked_given_a_restart_stopping_the_backend() {
        AtomicReference<ExitingApplicationRestarter> restarter = new AtomicReference<>();
        restarter.set(new ExitingApplicationRestarter(executor, clock, clock::advance, restartThreads::add, () -> {
            restarter.get().restartAfterCommitOnceAsyncWorkIsDone();
            restarter.get().restartAfterCommitForRestore();
            exit();
        }));

        restarter.get().restartAfterCommitOnceAsyncWorkIsDone();
        restartThreads.getFirst().run();

        assertThat(restartThreads).hasSize(1);
        assertThat(exits).hasValue(1);
        assertThat(lines.list).extracting(ILoggingEvent::getLevel, ILoggingEvent::getFormattedMessage).containsExactly(
                tuple(Level.INFO, STOPPING),
                tuple(Level.WARN, JOINED_WHILE_EXITING),
                tuple(Level.WARN, JOINED_WHILE_EXITING));
    }

    @Test
    @DisplayName("Given the key card watching 100 polls 3 s apart for the new key, when the restart's delay, bound and the 20 s stop are added up, then at least a minute is left for the start, so the card normally sees the restart")
    void should_leave_the_key_card_a_minute_for_the_start_when_added_up_given_its_watch() {
        Duration beforeTheStart = ExitingApplicationRestarter.DELAY.plus(ExitingApplicationRestarter.ASYNC_WORK_BOUND).plus(STOP);

        assertThat(ExitingApplicationRestarter.ASYNC_WORK_BOUND).isEqualTo(Duration.ofMinutes(3));
        assertThat(beforeTheStart.plus(START_UP)).isLessThanOrEqualTo(KEY_CARD_WATCH);
    }

    private void startTaskThatWaitsForRelease() throws InterruptedException {
        executor.execute(() -> {
            taskStarted.countDown();
            awaitQuietly(releaseTask);
            steps.add("task ended");
        });
        assertThat(taskStarted.await(10, TimeUnit.SECONDS)).isTrue();
    }

    private List<String> messages() {
        return lines.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
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
