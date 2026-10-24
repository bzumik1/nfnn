package cz.novanadeje.app.donors.infrastructure.reminder;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.DonorRegistrationReminderService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.QueryTimeoutException;
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
import static org.mockito.Mockito.when;

class RegistrationReminderSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withPropertyValues("app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-")
            .withBean(DonorRegistrationReminderService.class, () -> mock(DonorRegistrationReminderService.class))
            .withUserConfiguration(RegistrationReminderScheduler.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the job runs every hour at twenty past")
    void should_schedule_job_hourly_at_twenty_past_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).singleElement().satisfies(task -> {
                assertThat(task.getExpression()).isEqualTo("0 20 * * * *");
                assertThat(nextRunAfter(task, "2026-10-17T12:30:00Z")).isEqualTo(Instant.parse("2026-10-17T13:20:00Z"));
            });
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then the job is not scheduled")
    void should_schedule_nothing_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.donors.registration-reminder.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).isEmpty();
        });
    }

    @Test
    @DisplayName("Given a failing service, when the job runs, then it swallows the failure and logs one ERROR line with the exception class")
    void should_log_failure_and_continue_when_run_given_failing_service() {
        DonorRegistrationReminderService service = mock(DonorRegistrationReminderService.class);
        when(service.remindUnconfirmed()).thenThrow(new QueryTimeoutException("timeout"));
        Logger schedulerLog = (Logger) LoggerFactory.getLogger(RegistrationReminderScheduler.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        schedulerLog.addAppender(logged);
        try {
            new RegistrationReminderScheduler(service).remindUnconfirmedRegistrations();

            assertThat(logged.list).singleElement().satisfies(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).contains("QueryTimeoutException");
            });
        } finally {
            schedulerLog.detachAppender(logged);
        }
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
}
