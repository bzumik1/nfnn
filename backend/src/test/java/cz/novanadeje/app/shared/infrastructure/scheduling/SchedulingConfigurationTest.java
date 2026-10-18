package cz.novanadeje.app.shared.infrastructure.scheduling;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import static org.assertj.core.api.Assertions.assertThat;

class SchedulingConfigurationTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TaskSchedulingAutoConfiguration.class))
            .withUserConfiguration(SchedulingConfiguration.class);

    @Test
    @DisplayName("Given the application's task scheduler, when it shuts down, then tasks still waiting for their time are dropped so only a running import is awaited")
    void should_drop_delayed_tasks_when_shut_down_given_application_task_scheduler() {
        contexts.run(context -> assertThat(context.getBean(ThreadPoolTaskScheduler.class).getScheduledThreadPoolExecutor()
                .getExecuteExistingDelayedTasksAfterShutdownPolicy()).isFalse());
    }
}
