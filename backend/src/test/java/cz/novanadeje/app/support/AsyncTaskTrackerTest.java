package cz.novanadeje.app.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AsyncTaskTrackerTest {

    private final AsyncTaskTracker tracker = new AsyncTaskTracker();

    @Test
    @DisplayName("Given a submitted task that has not started yet, when idle is awaited, then the wait returns only after the task ran")
    void should_wait_for_the_task_when_idle_is_awaited_given_a_task_not_started_yet() throws InterruptedException {
        AtomicBoolean ran = new AtomicBoolean();
        Runnable task = tracker.decorate(() -> ran.set(true));
        Thread worker = Thread.ofVirtual().unstarted(() -> {
            pause(Duration.ofMillis(300));
            task.run();
        });
        worker.start();

        tracker.awaitIdle(Duration.ofSeconds(5));

        assertThat(ran).isTrue();
        worker.join();
    }

    @Test
    @DisplayName("Given a task that failed, when idle is awaited, then the wait returns")
    void should_return_when_idle_is_awaited_given_a_failed_task() {
        Runnable task = tracker.decorate(() -> {
            throw new IllegalStateException("failed");
        });
        assertThatThrownBy(task::run).isInstanceOf(IllegalStateException.class);

        tracker.awaitIdle(Duration.ofMillis(100));
    }

    @Test
    @DisplayName("Given a task that does not finish, when idle is awaited, then the wait fails after the timeout")
    void should_fail_after_the_timeout_when_idle_is_awaited_given_a_task_that_does_not_finish() throws InterruptedException {
        CountDownLatch release = new CountDownLatch(1);
        Runnable task = tracker.decorate(() -> {
            try {
                release.await();
            } catch (InterruptedException stopped) {
                Thread.currentThread().interrupt();
            }
        });
        Thread worker = Thread.ofVirtual().start(task);

        assertThatThrownBy(() -> tracker.awaitIdle(Duration.ofMillis(200))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("did not finish");
        release.countDown();
        worker.join();
    }

    private static void pause(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        }
    }
}
