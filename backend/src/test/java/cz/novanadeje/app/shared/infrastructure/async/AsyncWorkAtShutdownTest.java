package cz.novanadeje.app.shared.infrastructure.async;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.LifecycleAutoConfiguration;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class AsyncWorkAtShutdownTest {

    private final CountDownLatch closing = new CountDownLatch(1);
    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(LifecycleAutoConfiguration.class, TaskExecutionAutoConfiguration.class))
            .withBean("closingSignal", ApplicationListener.class, () -> (ApplicationListener<ContextClosedEvent>) closed -> closing.countDown());

    @Test
    @DisplayName("Given async work handed to the application executor that runs on past the executor's own stop, when the context closes, then the close waits until the work is done")
    void should_finish_the_work_before_the_close_ends_when_closed_given_async_work_running_past_the_executor_stop() {
        AtomicBoolean done = new AtomicBoolean();

        contexts.run(context -> {
            ThreadPoolTaskExecutor executor = context.getBean("applicationTaskExecutor", ThreadPoolTaskExecutor.class);
            executor.execute(() -> {
                try {
                    assertThat(closing.await(10, TimeUnit.SECONDS)).isTrue();
                    await().atMost(Duration.ofSeconds(10)).until(() -> !executor.isRunning());
                    done.set(true);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        });

        assertThat(done).isTrue();
    }
}
