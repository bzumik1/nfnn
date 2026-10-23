package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MonthlyReportSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(MonthlyReportScheduler.class, Support.class, Scheduling.class)
            .withPropertyValues("app.donations.report.recipient=info@nfnn.cz");

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the check runs at the start of every hour, so any send hour can be chosen")
    void should_schedule_check_every_hour_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            CronTask task = (CronTask) context.getBean(ScheduledTaskHolder.class).getScheduledTasks().stream()
                    .map(ScheduledTask::getTask)
                    .filter(CronTask.class::isInstance)
                    .filter(candidate -> ((CronTask) candidate).getExpression().equals("0 0 * * * *"))
                    .findFirst()
                    .orElseThrow();
            assertThat(nextRunAfter(task, "2026-09-30T23:30:00Z")).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
            assertThat(nextRunAfter(task, "2026-12-01T06:59:59Z")).isEqualTo(Instant.parse("2026-12-01T07:00:00Z"));
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then there is no report scheduler")
    void should_create_no_scheduler_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.donations.report.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(MonthlyReportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given an empty cron, when the context starts, then there is no report scheduler")
    void should_create_no_scheduler_when_started_given_empty_cron() {
        contexts.withPropertyValues("app.donations.report.cron=").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(MonthlyReportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a recipient that is not an e-mail address, when the context starts, then startup fails naming REPORT_RECIPIENT")
    void should_fail_startup_when_started_given_malformed_recipient() {
        contexts.withPropertyValues("app.donations.report.cron=-", "app.donations.report.recipient=foundation").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("REPORT_RECIPIENT");
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
    @EnableConfigurationProperties(MonthlyReportProperties.class)
    static class Support {

        @Bean
        MonthlyReportService monthlyReportService() {
            return mock(MonthlyReportService.class);
        }
    }
}
