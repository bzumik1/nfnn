package cz.novanadeje.app.contact.infrastructure.retention;

import cz.novanadeje.app.contact.application.ContactMessageRetentionService;
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

class ContactMessageRetentionSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(ContactMessageRetentionScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the job runs every day at 03:30 Prague time in summer and in winter")
    void should_schedule_job_daily_at_half_past_three_prague_time_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            List<CronTask> tasks = cronTasks(context.getBean(ScheduledTaskHolder.class));
            assertThat(tasks).singleElement().satisfies(task -> {
                assertThat(task.getExpression()).isEqualTo("0 30 3 * * *");
                assertThat(nextRunAfter(task, "2026-10-17T12:00:00Z")).isEqualTo(Instant.parse("2026-10-18T01:30:00Z"));
                assertThat(nextRunAfter(task, "2026-12-01T12:00:00Z")).isEqualTo(Instant.parse("2026-12-02T02:30:00Z"));
            });
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then the job is not scheduled")
    void should_schedule_nothing_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.contact.retention.cron=-", "app.operations.backups.check-cron=-").run(context -> {
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
        ContactMessageRetentionService contactMessageRetentionService() {
            return mock(ContactMessageRetentionService.class);
        }
    }
}
