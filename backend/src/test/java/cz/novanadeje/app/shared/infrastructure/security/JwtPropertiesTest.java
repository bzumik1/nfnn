package cz.novanadeje.app.shared.infrastructure.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class JwtPropertiesTest {

    private static final String AUDIENCE = "http://localhost:4200/api";
    private static final String SERVER_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(withoutSystemEnvironment())
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given the default dev profile without JWT_SECRET, when the context starts, then tokens are signed with the local development secret")
    void should_use_development_secret_when_started_given_dev_profile_without_env_var() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JwtProperties.class).secret()).hasSizeGreaterThanOrEqualTo(32);
        });
    }

    @Test
    @DisplayName("Given the prod profile without JWT_SECRET, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_prod_profile_without_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("JWT_SECRET (app.security.jwt.secret)");
        });
    }

    @Test
    @DisplayName("Given the prod profile with an empty JWT_SECRET, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_prod_profile_with_empty_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod", "JWT_SECRET=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("JWT_SECRET (app.security.jwt.secret)");
        });
    }

    @Test
    @DisplayName("Given the prod profile with JWT_SECRET, when the context starts, then tokens are signed with that secret")
    void should_use_env_var_when_started_given_prod_profile_with_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod", "JWT_SECRET=" + SERVER_SECRET).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JwtProperties.class).secret()).isEqualTo(SERVER_SECRET);
        });
    }

    @Test
    @DisplayName("Given a secret of 32 characters, when the properties are made, then it is kept")
    void should_keep_secret_when_made_given_32_characters() {
        String secret = "a".repeat(32);

        assertThat(new JwtProperties("nova-nadeje", secret, Duration.ofMinutes(15), AUDIENCE).secret()).isEqualTo(secret);
    }

    @Test
    @DisplayName("Given the default dev profile, when the context starts, then tokens are issued for the API of the public URL")
    void should_derive_audience_from_public_url_when_started_given_dev_profile() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(JwtProperties.class).audience()).isEqualTo("http://localhost:4200/api");
        });
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    @DisplayName("Given a missing audience, when the properties are made, then they fail naming the property")
    void should_fail_naming_property_when_made_given_missing_audience(String audience) {
        assertThatIllegalArgumentException().isThrownBy(() -> new JwtProperties("nova-nadeje", "a".repeat(32), Duration.ofMinutes(15), audience))
                .withMessageContaining("app.security.jwt.audience");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "too-short-secret-of-31-characte"})
    @DisplayName("Given a missing or short secret, when the properties are made, then they fail naming the environment variable without the value")
    void should_fail_naming_env_var_when_made_given_missing_or_short_secret(String secret) {
        assertThatIllegalArgumentException().isThrownBy(() -> new JwtProperties("nova-nadeje", secret, Duration.ofMinutes(15), AUDIENCE))
                .withMessageContaining("JWT_SECRET (app.security.jwt.secret)")
                .withMessageNotContaining("too-short");
    }

    private static ApplicationContextInitializer<ConfigurableApplicationContext> withoutSystemEnvironment() {
        return context -> context.getEnvironment().getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JwtProperties.class)
    static class Support {
    }
}
