package cz.novanadeje.app.operations.infrastructure.release;

import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.scheduling.support.SimpleTriggerContext;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ReleaseHistoryCleanupSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(ReleaseHistoryCleanupScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the clean-up runs every day at 03:40 Prague time in summer and in winter")
    void should_schedule_the_clean_up_daily_at_twenty_to_four_prague_time_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).singleElement().satisfies(task -> {
                assertThat(task.getExpression()).isEqualTo("0 40 3 * * *");
                assertThat(nextRunAfter(task, "2026-07-17T12:00:00Z")).isEqualTo(Instant.parse("2026-07-18T01:40:00Z"));
                assertThat(nextRunAfter(task, "2026-12-01T12:00:00Z")).isEqualTo(Instant.parse("2026-12-02T02:40:00Z"));
            });
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then the clean-up is not scheduled")
    void should_schedule_nothing_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.operations.release-history.cleanup-cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).isEmpty();
        });
    }

    private static List<CronTask> cronTasks(ScheduledTaskHolder holder) {
        return holder.getScheduledTasks().stream()
                .map(ScheduledTask::getTask)
                .filter(CronTask.class::isInstance)
                .map(CronTask.class::cast)
                .toList();
    }

    private static Instant nextRunAfter(CronTask task, String instant) {
        return task.getTrigger().nextExecution(new SimpleTriggerContext(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    static class Scheduling {
    }

    @Configuration(proxyBeanMethods = false)
    static class Support {

        @Bean
        ReleaseHistoryService releaseHistoryService() {
            return mock(ReleaseHistoryService.class);
        }
    }
}
