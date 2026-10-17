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

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
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
