package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.fio.FioClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import java.time.Clock;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.InstanceOfAssertFactories.type;
import static org.mockito.Mockito.mock;

class FioImportConfigurationTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(FioImportConfiguration.class, FioImportScheduler.class, Support.class)
            .withPropertyValues(
                    "app.donations.fio.base-uri=https://fioapi.fio.cz/v1/rest",
                    "app.donations.fio.interval=PT1H",
                    "app.donations.fio.initial-delay=PT30S",
                    "app.donations.fio.request-timeout=PT2M",
                    "app.donations.import.overlap=P3D",
                    "app.donations.import.history-window=P89D",
                    "app.donations.import.history-from=");

    @Test
    @DisplayName("Given an empty token, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_empty_token() {
        contexts.withPropertyValues("app.donations.fio.token=").run(context -> {
            assertThat(context).hasSingleBean(FioClient.class);
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given no token property, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_no_token() {
        contexts.run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a blank token, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_blank_token() {
        contexts.withPropertyValues("app.donations.fio.token=   ").run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a token, when the context starts, then the Fio client is the library's HTTP client and the import scheduler exists")
    void should_create_http_client_when_started_given_token() {
        contexts.withPropertyValues("app.donations.fio.token=abc").run(context -> {
            FioClient client = context.getBean(FioClient.class);
            assertThat(client).isNotInstanceOf(DisabledFioClient.class);
            assertThat(client.getClass().getSimpleName()).isEqualTo("HttpFioClient");
            assertThat(context).hasSingleBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a token and scheduling enabled, when the context starts, then one hourly import task is scheduled 30 seconds after the start")
    void should_schedule_hourly_import_when_started_given_token_and_scheduling() {
        contexts.withUserConfiguration(Scheduling.class).withPropertyValues("app.donations.fio.token=abc").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ScheduledTaskHolder.class).getScheduledTasks())
                    .singleElement()
                    .extracting(ScheduledTask::getTask, type(FixedDelayTask.class))
                    .satisfies(task -> {
                        assertThat(task.getIntervalDuration()).isEqualTo(Duration.ofHours(1));
                        assertThat(task.getInitialDelayDuration()).isEqualTo(Duration.ofSeconds(30));
                    });
        });
    }

    @Test
    @DisplayName("Given a token with a character Fio never issues, when the context starts, then startup fails with the reason and without the token")
    void should_fail_startup_when_started_given_malformed_token() {
        contexts.withPropertyValues("app.donations.fio.token=abc'def").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .hasMessage("A Fio API token may contain only letters, digits, '-' and '_'");
            assertThat(context.getStartupFailure()).rootCause().message().doesNotContain("abc'def");
        });
    }

    @Test
    @DisplayName("Given a history start that is not an ISO date, when the context starts, then startup fails naming FIO_HISTORY_FROM")
    void should_fail_startup_when_started_given_malformed_history_from() {
        contexts.withPropertyValues("app.donations.fio.token=abc", "app.donations.import.history-from=1.1.2025").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD");
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    static class Scheduling {
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({FioImportProperties.class, BankImportProperties.class})
    static class Support {

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        ImportBankPaymentsService importBankPaymentsService() {
            return mock(ImportBankPaymentsService.class);
        }

        @Bean
        TaskScheduler taskScheduler() {
            return mock(TaskScheduler.class);
        }
    }
}
