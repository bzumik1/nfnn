package cz.novanadeje.app.donations.infrastructure.banklogo;

import cz.novanadeje.app.donations.application.banklogo.BankLogoRefreshService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.scheduling.support.SimpleTriggerContext;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class BankLogoSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(BankLogoScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the check runs every day at 05:50 Prague time, also across the change to winter time")
    void should_schedule_daily_check_at_prague_morning_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(BankLogoScheduler.class);
            CronTask task = (CronTask) context.getBean(ScheduledTaskHolder.class).getScheduledTasks().stream()
                    .map(ScheduledTask::getTask)
                    .filter(CronTask.class::isInstance)
                    .filter(candidate -> ((CronTask) candidate).getExpression().equals("0 50 5 * * *"))
                    .findFirst()
                    .orElseThrow();
            assertThat(nextRunAfter(task, "2026-10-24T00:00:00Z")).isEqualTo(Instant.parse("2026-10-24T03:50:00Z"));
            assertThat(nextRunAfter(task, "2026-10-24T03:50:00Z")).isEqualTo(Instant.parse("2026-10-25T04:50:00Z"));
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then there is no bank logo scheduler")
    void should_create_no_scheduler_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.donations.bank-logos.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(BankLogoScheduler.class);
        });
    }

    @Test
    @DisplayName("Given an empty cron, when the context starts, then there is no bank logo scheduler")
    void should_create_no_scheduler_when_started_given_empty_cron() {
        contexts.withPropertyValues("app.donations.bank-logos.cron=").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(BankLogoScheduler.class);
        });
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
        BankLogoRefreshService bankLogoRefreshService() {
            return mock(BankLogoRefreshService.class);
        }

        @Bean
        TaskScheduler taskScheduler() {
            return mock(TaskScheduler.class);
        }

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }
}
