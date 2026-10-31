package cz.novanadeje.app.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskDecorator;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AsyncTaskTrackerTest {

    private static final String STEP = "POST /api/donors/me/email-change";

    private final AsyncTaskTracker tracker = new AsyncTaskTracker();
    private final TaskDecorator decorator = tracker.decorator();

    @Test
    @DisplayName("Given a submitted task that has not started yet, when idle is awaited, then the wait returns only after the task ran")
    void should_wait_for_the_task_when_idle_is_awaited_given_a_task_not_started_yet() throws InterruptedException {
        AtomicBoolean ran = new AtomicBoolean();
        Runnable task = decorator.decorate(() -> ran.set(true));
        Thread worker = Thread.ofVirtual().unstarted(() -> {
            pause(Duration.ofMillis(300));
            task.run();
        });
        worker.start();

        tracker.awaitIdleAfter(STEP, Duration.ofSeconds(5));

        assertThat(ran).isTrue();
        worker.join();
    }

    @Test
    @DisplayName("Given a task that failed, when idle is awaited, then the wait returns")
    void should_return_when_idle_is_awaited_given_a_failed_task() {
        Runnable task = decorator.decorate(() -> {
            throw new IllegalStateException("failed");
        });
        assertThatThrownBy(task::run).isInstanceOf(IllegalStateException.class);

        assertThatCode(() -> tracker.awaitIdleAfter(STEP, Duration.ofMillis(100))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a task that does not finish, when idle is awaited, then the wait fails after the timeout")
    void should_fail_after_the_timeout_when_idle_is_awaited_given_a_task_that_does_not_finish() throws InterruptedException {
        CountDownLatch release = new CountDownLatch(1);
        Thread worker = Thread.ofVirtual().start(decorator.decorate(() -> awaitQuietly(release)));

        assertThatThrownBy(() -> tracker.awaitIdleAfter(STEP, Duration.ofMillis(200))).isInstanceOf(IllegalStateException.class)
                .hasMessage("After " + STEP + ", 1 asynchronous task did not finish within PT0.2S");
        release.countDown();
        worker.join();
    }

    @Test
    @DisplayName("Given a task that submits another before it finishes, when idle is awaited, then the wait returns only after both ran")
    void should_wait_for_both_when_idle_is_awaited_given_a_task_that_submits_another() throws InterruptedException {
        AtomicBoolean childRan = new AtomicBoolean();
        Thread[] child = new Thread[1];
        Thread parent = Thread.ofVirtual().start(decorator.decorate(() -> child[0] = Thread.ofVirtual().start(decorator.decorate(() -> {
            pause(Duration.ofMillis(300));
            childRan.set(true);
        }))));

        parent.join();
        tracker.awaitIdleAfter(STEP, Duration.ofSeconds(5));

        assertThat(childRan).isTrue();
        child[0].join();
    }

    @Test
    @DisplayName("Given a decorated task that ran twice, when idle is awaited while another task runs, then the wait still waits for it")
    void should_count_each_task_once_when_idle_is_awaited_given_a_task_that_ran_twice() throws InterruptedException {
        Runnable twice = decorator.decorate(() -> { });
        twice.run();
        twice.run();
        CountDownLatch release = new CountDownLatch(1);
        Thread worker = Thread.ofVirtual().start(decorator.decorate(() -> awaitQuietly(release)));

        assertThatThrownBy(() -> tracker.awaitIdleAfter(STEP, Duration.ofMillis(200))).isInstanceOf(IllegalStateException.class);
        release.countDown();
        worker.join();
    }

    @Test
    @DisplayName("Given a tracker attached to no executor, when idle is awaited, then it fails instead of skipping the wait")
    void should_fail_when_idle_is_awaited_given_a_tracker_attached_to_no_executor() {
        assertThatThrownBy(() -> new AsyncTaskTracker().awaitIdleAfter(STEP, Duration.ofMillis(100))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("attached to no executor");
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pause(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        }
    }
}
