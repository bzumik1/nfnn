package cz.novanadeje.app.operations.infrastructure.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.logging.DeferredLogs;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.support.PropertiesLoaderUtils;

import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

import static cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeysTest.SERVER_BACKUP_KEY;
import static cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeysTest.SERVER_SETTINGS_KEY;
import static cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeysTest.developmentValue;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatNoException;

class DevelopmentKeysGuardTest {

    private final DevelopmentKeysGuard guard = new DevelopmentKeysGuard();

    @Test
    @DisplayName("Given the default development profile with its public keys, when the backend starts, then nothing is refused")
    void should_refuse_nothing_when_started_given_the_default_development_profile() {
        assertThatNoException().isThrownBy(() -> guard.postProcessEnvironment(environment(), new SpringApplication()));
    }

    @Test
    @DisplayName("Given development and another profile of its own, when the backend starts, then nothing is refused")
    void should_refuse_nothing_when_started_given_development_with_another_profile() {
        assertThatNoException().isThrownBy(() -> guard.postProcessEnvironment(environment("spring.profiles.active=dev,local"), new SpringApplication()));
    }

    @Test
    @DisplayName("Given exactly the prod profile with the server's own keys, when the backend starts, then nothing is refused")
    void should_refuse_nothing_when_started_given_prod_with_its_own_keys() {
        assertThatNoException().isThrownBy(() -> guard.postProcessEnvironment(
                environment("spring.profiles.active=prod", "SETTINGS_KEY=" + SERVER_SETTINGS_KEY, "BACKUP_KEY=" + SERVER_BACKUP_KEY), new SpringApplication()));
    }

    @Test
    @DisplayName("Given exactly the prod profile before the keys exist, when the backend starts, then the guard leaves them to their own checks")
    void should_refuse_nothing_when_started_given_prod_without_keys() {
        assertThatNoException().isThrownBy(() -> guard.postProcessEnvironment(environment("spring.profiles.active=prod"), new SpringApplication()));
    }

    @Test
    @DisplayName("Given the prod profile with the public development SETTINGS_KEY, when the backend starts, then it stops naming the variable without its value")
    void should_stop_naming_the_variable_when_started_given_prod_with_the_development_settings_key() {
        String developmentKey = developmentValue("app.operations.settings.key");

        assertThatIllegalStateException()
                .isThrownBy(() -> guard.postProcessEnvironment(
                        environment("spring.profiles.active=prod", "SETTINGS_KEY=" + developmentKey, "BACKUP_KEY=" + SERVER_BACKUP_KEY), new SpringApplication()))
                .withMessageContaining("SETTINGS_KEY (app.operations.settings.key)")
                .withMessageContaining("development")
                .withMessageNotContaining(developmentKey);
    }

    @Test
    @DisplayName("Given the prod profile with the public development BACKUP_KEY in any case, when the backend starts, then it stops naming the variable without its value")
    void should_stop_naming_the_variable_when_started_given_prod_with_the_development_backup_key() {
        String developmentKey = developmentValue("app.operations.backup-key.value");
        String lowerCase = developmentKey.toLowerCase(Locale.ROOT);

        assertThatIllegalStateException()
                .isThrownBy(() -> guard.postProcessEnvironment(
                        environment("spring.profiles.active=prod", "SETTINGS_KEY=" + SERVER_SETTINGS_KEY, "BACKUP_KEY=" + lowerCase), new SpringApplication()))
                .withMessageContaining("BACKUP_KEY (app.operations.backup-key.value)")
                .withMessageContaining("development")
                .withMessageNotContaining(developmentKey)
                .withMessageNotContaining(lowerCase);
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod,dev", "dev,prod", "prod,local", "staging"})
    @DisplayName("Given profiles other than development alone or exactly prod, when the backend starts, then it stops naming the active profiles")
    void should_stop_naming_the_profiles_when_started_given_neither_development_nor_exactly_prod(String profiles) {
        assertThatIllegalStateException()
                .isThrownBy(() -> guard.postProcessEnvironment(environment("spring.profiles.active=" + profiles), new SpringApplication()))
                .withMessageContaining("SPRING_PROFILES_ACTIVE=prod")
                .withMessageContaining(Arrays.toString(profiles.split(",")));
    }

    @Test
    @DisplayName("Given the backend's environment post-processors, when Spring Boot loads them, then the guard is registered and runs before the stored settings are read")
    void should_run_before_the_stored_settings_when_loaded_given_the_registered_post_processors() throws IOException {
        String registered = PropertiesLoaderUtils.loadAllProperties("META-INF/spring.factories").getProperty(EnvironmentPostProcessor.class.getName());

        assertThat(registered).contains(DevelopmentKeysGuard.class.getName());
        assertThat(guard.getOrder()).isLessThan(new DatabaseSettingsEnvironmentPostProcessor(new DeferredLogs()).getOrder());
    }

    private static ConfigurableEnvironment environment(String... properties) {
        AtomicReference<ConfigurableEnvironment> environment = new AtomicReference<>();
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues(properties)
                .run(context -> environment.set(context.getSourceApplicationContext().getEnvironment()));
        return environment.get();
    }
}
