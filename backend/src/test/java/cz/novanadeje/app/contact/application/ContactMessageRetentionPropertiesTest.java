package cz.novanadeje.app.contact.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ContactMessageRetentionPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then contact messages are kept for 365 days")
    void should_keep_messages_for_365_days_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ContactMessageRetentionProperties.class).maxAge()).isEqualTo(Duration.ofDays(365));
        });
    }

    @Test
    @DisplayName("Given a configured retention, when the context starts, then it is used")
    void should_use_configured_retention_when_started_given_property() {
        contexts.withPropertyValues("app.contact.retention.max-age=P30D").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ContactMessageRetentionProperties.class).maxAge()).isEqualTo(Duration.ofDays(30));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"PT0S", "-P1D"})
    @DisplayName("Given a retention that is not positive, when the properties are made, then they fail naming the property")
    void should_fail_naming_property_when_made_given_non_positive_retention(String maxAge) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new ContactMessageRetentionProperties(Duration.parse(maxAge)))
                .withMessageContaining("app.contact.retention.max-age");
    }

    @Test
    @DisplayName("Given an empty retention, when the context starts, then it fails naming the property")
    void should_fail_naming_property_when_started_given_empty_retention() {
        contexts.withPropertyValues("app.contact.retention.max-age=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("app.contact.retention.max-age");
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ContactMessageRetentionProperties.class)
    static class Support {
    }
}
