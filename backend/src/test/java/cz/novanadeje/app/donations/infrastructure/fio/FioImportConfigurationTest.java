package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.fio.FioClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;

class FioImportConfigurationTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(FioImportConfiguration.class, Support.class)
            .withPropertyValues(
                    "app.donations.fio.base-uri=https://fioapi.fio.cz/v1/rest",
                    "app.donations.fio.interval=PT1H",
                    "app.donations.fio.initial-delay=PT30S",
                    "app.donations.fio.request-timeout=PT2M");

    @Test
    @DisplayName("Given an empty token, when the context starts, then the Fio client is the disabled one and nothing token-conditional is created")
    void should_create_disabled_client_when_started_given_empty_token() {
        contexts.withPropertyValues("app.donations.fio.token=").run(context -> {
            assertThat(context).hasSingleBean(FioClient.class);
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(TokenConditional.class);
        });
    }

    @Test
    @DisplayName("Given no token property, when the context starts, then the Fio client is the disabled one")
    void should_create_disabled_client_when_started_given_no_token() {
        contexts.run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(TokenConditional.class);
        });
    }

    @Test
    @DisplayName("Given a blank token, when the context starts, then the Fio client is the disabled one")
    void should_create_disabled_client_when_started_given_blank_token() {
        contexts.withPropertyValues("app.donations.fio.token=   ").run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(TokenConditional.class);
        });
    }

    @Test
    @DisplayName("Given a token, when the context starts, then the Fio client is the library's HTTP client and token-conditional beans exist")
    void should_create_http_client_when_started_given_token() {
        contexts.withPropertyValues("app.donations.fio.token=abc").run(context -> {
            FioClient client = context.getBean(FioClient.class);
            assertThat(client).isNotInstanceOf(DisabledFioClient.class);
            assertThat(client.getClass().getSimpleName()).isEqualTo("HttpFioClient");
            assertThat(context).hasSingleBean(TokenConditional.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(FioImportProperties.class)
    static class Support {

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        @Conditional(FioTokenPresentCondition.class)
        TokenConditional tokenConditional() {
            return new TokenConditional();
        }
    }

    static final class TokenConditional {
    }
}
