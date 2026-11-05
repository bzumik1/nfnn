package cz.novanadeje.app.donors.infrastructure.session;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.DonorSessionCleanupService;
import cz.novanadeje.app.donors.application.DonorSessionCleanupService.SessionCleanup;
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
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionCleanupSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withBean(DonorSessionCleanupService.class, () -> mock(DonorSessionCleanupService.class))
            .withUserConfiguration(SessionCleanupScheduler.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the cleanup runs daily at 04:10 Prague time")
    void should_schedule_daily_at_ten_past_four_prague_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).singleElement().satisfies(task -> {
                assertThat(task.getExpression()).isEqualTo("0 10 4 * * *");
                assertThat(nextRunAfter(task, "2026-11-05T12:00:00Z")).isEqualTo(Instant.parse("2026-11-06T03:10:00Z"));
            });
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then the cleanup is not scheduled")
    void should_schedule_nothing_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.donors.session-cleanup.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(cronTasks(context.getBean(ScheduledTaskHolder.class))).isEmpty();
        });
    }

    @Test
    @DisplayName("Given a cleanup that ended and deleted rows, when the job runs, then it logs one INFO line with the counts only")
    void should_log_counts_when_run_given_cleanup() {
        DonorSessionCleanupService service = mock(DonorSessionCleanupService.class);
        when(service.cleanUp()).thenReturn(new SessionCleanup(2, 31, 1));

        logged(() -> new SessionCleanupScheduler(service).cleanUpSessions(), lines -> assertThat(lines).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.INFO);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("Session cleanup ended 2 expired devices, deleted 31 spent refresh tokens and 1 ended devices");
        }));
    }

    @Test
    @DisplayName("Given a failing cleanup, when the job runs, then it swallows the failure and logs one ERROR line with the exception class")
    void should_log_failure_and_continue_when_run_given_failing_cleanup() {
        DonorSessionCleanupService service = mock(DonorSessionCleanupService.class);
        when(service.cleanUp()).thenThrow(new QueryTimeoutException("timeout on donor_device"));

        logged(() -> new SessionCleanupScheduler(service).cleanUpSessions(), lines -> assertThat(lines).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).contains("QueryTimeoutException").doesNotContain("donor_device");
        }));
    }

    private static void logged(Runnable run, Consumer<List<ILoggingEvent>> check) {
        Logger schedulerLog = (Logger) LoggerFactory.getLogger(SessionCleanupScheduler.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        schedulerLog.addAppender(logged);
        try {
            run.run();
            check.accept(logged.list);
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
