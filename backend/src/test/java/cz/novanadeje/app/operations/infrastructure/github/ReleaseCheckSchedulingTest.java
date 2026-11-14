package cz.novanadeje.app.operations.infrastructure.github;

import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
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

class ReleaseCheckSchedulingTest {

    private static final String SOURCE = "app.operations.releases.source=https://api.github.com/repos/bzumik1/nfnn/releases/latest";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(ReleaseCheckScheduler.class, Support.class, Scheduling.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the check runs every day at 06:10 Prague time, also across the change to winter time")
    void should_schedule_daily_check_at_prague_morning_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(ReleaseCheckScheduler.class);
            CronTask task = (CronTask) context.getBean(ScheduledTaskHolder.class).getScheduledTasks().stream()
                    .map(ScheduledTask::getTask)
                    .filter(CronTask.class::isInstance)
                    .filter(candidate -> ((CronTask) candidate).getExpression().equals("0 10 6 * * *"))
                    .findFirst()
                    .orElseThrow();
            assertThat(nextRunAfter(task, "2026-10-24T00:00:00Z")).isEqualTo(Instant.parse("2026-10-24T04:10:00Z"));
            assertThat(nextRunAfter(task, "2026-10-24T04:10:00Z")).isEqualTo(Instant.parse("2026-10-25T05:10:00Z"));
        });
    }

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the GitHub address of the repository's latest release binds")
    void should_bind_github_source_when_started_given_defaults() {
        contexts.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ReleaseSourceProperties.class).source())
                    .isEqualTo(URI.create("https://api.github.com/repos/bzumik1/nfnn/releases/latest"));
        });
    }

    @Test
    @DisplayName("Given a source on another host, when the context starts, then startup fails naming the setting")
    void should_fail_startup_when_started_given_other_host() {
        contexts.withPropertyValues("app.operations.releases.source=https://example.org/releases/latest", "app.operations.releases.cron=-").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("app.operations.releases.source");
        });
    }

    @Test
    @DisplayName("Given the cron \"-\", when the context starts, then there is no release check scheduler")
    void should_create_no_scheduler_when_started_given_disabled_cron() {
        contexts.withPropertyValues(SOURCE, "app.operations.releases.cron=-").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(ReleaseCheckScheduler.class);
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
    @EnableConfigurationProperties(ReleaseSourceProperties.class)
    static class Support {

        @Bean
        ReleaseCheckService releaseCheckService() {
            return mock(ReleaseCheckService.class);
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
