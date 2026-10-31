package cz.novanadeje.app.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AsyncTaskTrackingConfigurationTest {

    private static final Duration SHORT_WAIT = Duration.ofMillis(200);

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TaskExecutionAutoConfiguration.class, TaskSchedulingAutoConfiguration.class))
            .withUserConfiguration(SchedulingOn.class, AsyncTaskTrackingConfiguration.class);

    @Test
    @DisplayName("Given Boot's task executor and scheduler with the tracking, when a task is scheduled an hour ahead, then awaiting idle returns at once")
    void should_not_count_a_scheduled_task_when_idle_is_awaited() {
        contexts.run(context -> {
            ScheduledFuture<?> later = context.getBean(TaskScheduler.class).schedule(() -> { }, Instant.now().plus(Duration.ofHours(1)));

            assertThatCode(() -> context.getBean(AsyncTaskTracker.class).awaitIdleAfter("a test", SHORT_WAIT)).doesNotThrowAnyException();
            later.cancel(false);
        });
    }

    @Test
    @DisplayName("Given Boot's task executor and scheduler with the tracking, when a task on the application executor is still running, then awaiting idle waits for it")
    void should_count_an_application_executor_task_when_idle_is_awaited() {
        contexts.run(context -> {
            AsyncTaskTracker tracker = context.getBean(AsyncTaskTracker.class);
            CountDownLatch release = new CountDownLatch(1);
            context.getBean("applicationTaskExecutor", TaskExecutor.class).execute(() -> awaitQuietly(release));

            assertThatThrownBy(() -> tracker.awaitIdleAfter("a test", SHORT_WAIT)).isInstanceOf(IllegalStateException.class);
            release.countDown();
            assertThatCode(() -> tracker.awaitIdleAfter("a test", Duration.ofSeconds(5))).doesNotThrowAnyException();
        });
    }

    @Test
    @DisplayName("Given Boot's task executor and scheduler with the tracking, when a task runs again and again on the scheduler, then a running application executor task is still waited for")
    void should_still_count_an_application_executor_task_when_a_periodic_task_runs_on_the_scheduler() {
        contexts.run(context -> {
            AsyncTaskTracker tracker = context.getBean(AsyncTaskTracker.class);
            CountDownLatch runs = new CountDownLatch(5);
            ScheduledFuture<?> periodic = context.getBean(TaskScheduler.class).scheduleWithFixedDelay(runs::countDown, Duration.ofMillis(5));
            assertThat(runs.await(5, TimeUnit.SECONDS)).isTrue();
            periodic.cancel(false);
            CountDownLatch release = new CountDownLatch(1);
            context.getBean("applicationTaskExecutor", TaskExecutor.class).execute(() -> awaitQuietly(release));

            assertThatThrownBy(() -> tracker.awaitIdleAfter("a test", SHORT_WAIT)).isInstanceOf(IllegalStateException.class);
            release.countDown();
        });
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    static class SchedulingOn {
    }
}
