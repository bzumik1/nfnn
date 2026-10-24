package cz.novanadeje.app.content.application.media;

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

class UnusedMediaCleanupPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then unused photos are kept for 7 days")
    void should_keep_unused_photos_for_seven_days_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(UnusedMediaCleanupProperties.class).maxAge()).isEqualTo(Duration.ofDays(7));
        });
    }

    @Test
    @DisplayName("Given a configured grace, when the context starts, then it is used")
    void should_use_configured_grace_when_started_given_property() {
        contexts.withPropertyValues("app.content.media-cleanup.max-age=P30D").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(UnusedMediaCleanupProperties.class).maxAge()).isEqualTo(Duration.ofDays(30));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"PT0S", "-P1D"})
    @DisplayName("Given a grace that is not positive, when the properties are made, then they fail naming the property")
    void should_fail_naming_property_when_made_given_non_positive_grace(String maxAge) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new UnusedMediaCleanupProperties(Duration.parse(maxAge)))
                .withMessageContaining("app.content.media-cleanup.max-age");
    }

    @Test
    @DisplayName("Given an empty grace, when the context starts, then it fails naming the property")
    void should_fail_naming_property_when_started_given_empty_grace() {
        contexts.withPropertyValues("app.content.media-cleanup.max-age=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("app.content.media-cleanup.max-age");
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(UnusedMediaCleanupProperties.class)
    static class Support {
    }
}
