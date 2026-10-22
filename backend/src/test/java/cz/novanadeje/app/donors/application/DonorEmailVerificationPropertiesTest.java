package cz.novanadeje.app.donors.application;

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

class DonorEmailVerificationPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then a link lives a day and a donor holds at most three")
    void should_use_one_day_and_three_links_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            DonorEmailVerificationProperties properties = context.getBean(DonorEmailVerificationProperties.class);
            assertThat(properties.tokenTtl()).isEqualTo(Duration.ofHours(24));
            assertThat(properties.maxLiveLinks()).isEqualTo(3);
        });
    }

    @Test
    @DisplayName("Given a positive lifetime and one link, when the properties are made, then they keep the values")
    void should_keep_values_when_made_given_valid_values() {
        DonorEmailVerificationProperties properties = new DonorEmailVerificationProperties(Duration.ofMinutes(30), 1);

        assertThat(properties.tokenTtl()).isEqualTo(Duration.ofMinutes(30));
        assertThat(properties.maxLiveLinks()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PT0S", "-PT1H"})
    @DisplayName("Given a lifetime that is not positive, when the properties are made, then they fail naming the property")
    void should_fail_naming_property_when_made_given_non_positive_lifetime(String lifetime) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DonorEmailVerificationProperties(Duration.parse(lifetime), 3))
                .withMessageContaining("app.donors.email-verification.token-ttl");
    }

    @Test
    @DisplayName("Given no lifetime, when the properties are made, then they fail naming the property")
    void should_fail_naming_property_when_made_given_missing_lifetime() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DonorEmailVerificationProperties(null, 3))
                .withMessageContaining("app.donors.email-verification.token-ttl");
    }

    @Test
    @DisplayName("Given zero live links, when the context starts, then it fails naming the property")
    void should_fail_naming_property_when_started_given_zero_live_links() {
        contexts.withPropertyValues("app.donors.email-verification.max-live-links=0").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("app.donors.email-verification.max-live-links");
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(DonorEmailVerificationProperties.class)
    static class Support {
    }
}
