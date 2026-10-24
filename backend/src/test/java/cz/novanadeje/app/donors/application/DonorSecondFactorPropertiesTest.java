package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonorSecondFactorPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then a sign-in code waits five minutes for five attempts and a recovery by payment stays open fourteen days")
    void should_use_the_defaults_when_started_given_only_application_yml() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            DonorSecondFactorProperties properties = context.getBean(DonorSecondFactorProperties.class);
            assertThat(properties.challengeTtl()).isEqualTo(Duration.ofMinutes(5));
            assertThat(properties.challengeAttempts()).isEqualTo(5);
            assertThat(properties.issuer()).isEqualTo("Nová naděje");
            assertThat(properties.recoveryTtl()).isEqualTo(Duration.ofDays(14));
        });
    }

    @Test
    @DisplayName("Given a recovery lifetime that is not positive, when the properties are made, then they fail naming the property")
    void should_fail_naming_recovery_ttl_when_made_given_zero_recovery_ttl() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DonorSecondFactorProperties(Duration.ofMinutes(5), 5, "Nová naděje", Duration.ZERO))
                .withMessageContaining("app.donors.second-factor.recovery-ttl");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(DonorSecondFactorProperties.class)
    static class Support {
    }
}
