package cz.novanadeje.app.donations.infrastructure.receipt;

import cz.novanadeje.app.donations.application.receipt.YearlyReceiptAnnouncementService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class YearlyReceiptAnnouncementSchedulingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(YearlyReceiptAnnouncementScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the announcement checks every day at 10:00 Prague time, in winter time too")
    void should_schedule_daily_check_at_ten_in_prague_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(YearlyReceiptAnnouncementScheduler.class);
            CronTask task = (CronTask) context.getBean(ScheduledTaskHolder.class).getScheduledTasks().stream()
                    .map(ScheduledTask::getTask)
                    .filter(CronTask.class::isInstance)
                    .filter(candidate -> ((CronTask) candidate).getExpression().equals("0 0 10 * * *"))
                    .findFirst()
                    .orElseThrow();
            assertThat(nextRunAfter(task, "2027-01-01T12:00:00Z")).isEqualTo(Instant.parse("2027-01-02T09:00:00Z"));
            assertThat(nextRunAfter(task, "2027-01-02T09:00:00Z")).isEqualTo(Instant.parse("2027-01-03T09:00:00Z"));
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then there is no yearly receipt announcement scheduler")
    void should_create_no_scheduler_when_started_given_disabled_cron() {
        contexts.withPropertyValues("app.donations.yearly-receipt-announcement.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(YearlyReceiptAnnouncementScheduler.class);
        });
    }

    @Test
    @DisplayName("Given an empty cron, when the context starts, then there is no yearly receipt announcement scheduler")
    void should_create_no_scheduler_when_started_given_empty_cron() {
        contexts.withPropertyValues("app.donations.yearly-receipt-announcement.cron=").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(YearlyReceiptAnnouncementScheduler.class);
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
        YearlyReceiptAnnouncementService yearlyReceiptAnnouncementService() {
            return mock(YearlyReceiptAnnouncementService.class);
        }
    }
}
