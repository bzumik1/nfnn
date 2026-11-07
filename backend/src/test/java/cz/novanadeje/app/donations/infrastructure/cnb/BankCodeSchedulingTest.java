package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.application.bankcode.BankCodeRefreshService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
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

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class BankCodeSchedulingTest {

    private static final String SOURCE = "app.donations.bank-codes.source=https://www.cnb.cz/kody_bank_CR.csv";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(BankCodeScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the check runs every day at 05:40 Prague time, also across the change to winter time")
    void should_schedule_daily_check_at_prague_morning_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(BankCodeScheduler.class);
            CronTask task = (CronTask) context.getBean(ScheduledTaskHolder.class).getScheduledTasks().stream()
                    .map(ScheduledTask::getTask)
                    .filter(CronTask.class::isInstance)
                    .filter(candidate -> ((CronTask) candidate).getExpression().equals("0 40 5 * * *"))
                    .findFirst()
                    .orElseThrow();
            assertThat(nextRunAfter(task, "2026-10-24T00:00:00Z")).isEqualTo(Instant.parse("2026-10-24T03:40:00Z"));
            assertThat(nextRunAfter(task, "2026-10-24T03:40:00Z")).isEqualTo(Instant.parse("2026-10-25T04:40:00Z"));
        });
    }

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the ČNB address binds and passes validation")
    void should_bind_cnb_source_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(BankCodeProperties.class).source())
                    .isEqualTo(URI.create("https://www.cnb.cz/cs/platebni-styk/.galleries/ucty_kody_bank/download/kody_bank_CR.csv"));
        });
    }

    @Test
    @DisplayName("Given a plain http source, when the context starts, then startup fails naming the setting")
    void should_fail_startup_when_started_given_plain_http_source() {
        contexts.withPropertyValues("app.donations.bank-codes.source=http://www.cnb.cz/kody_bank_CR.csv", "app.donations.bank-codes.cron=-").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("app.donations.bank-codes.source");
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then there is no bank code scheduler")
    void should_create_no_scheduler_when_started_given_disabled_cron() {
        contexts.withPropertyValues(SOURCE, "app.donations.bank-codes.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(BankCodeScheduler.class);
        });
    }

    @Test
    @DisplayName("Given an empty cron, when the context starts, then there is no bank code scheduler")
    void should_create_no_scheduler_when_started_given_empty_cron() {
        contexts.withPropertyValues(SOURCE, "app.donations.bank-codes.cron=").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(BankCodeScheduler.class);
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
    @EnableConfigurationProperties(BankCodeProperties.class)
    static class Support {

        @Bean
        BankCodeRefreshService bankCodeRefreshService() {
            return mock(BankCodeRefreshService.class);
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
