package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import java.util.Base64;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class PublicDevelopmentKeysTest {

    static final String SERVER_SETTINGS_KEY = Base64.getEncoder().encodeToString("settings-key-of-thirty-two-byte!".getBytes());
    static final String SERVER_BACKUP_KEY = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";
    static final String SERVER_JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private final PublicDevelopmentKeys keys = PublicDevelopmentKeys.ofDevelopmentProfile();

    @Test
    @DisplayName("Given the development profile without an environment, when its public secrets are read, then they are the values that profile binds")
    void should_hold_the_bound_values_when_read_given_the_development_profile() {
        String settingsKey = developmentValue("app.operations.settings.key");
        String backupKey = developmentValue("app.operations.backup-key.value");
        String jwtSecret = developmentValue("app.security.jwt.secret");

        assertThat(settingsKey).isNotBlank();
        assertThat(backupKey).isNotBlank();
        assertThat(jwtSecret).isNotBlank();
        assertThat(keys.isJwtSecret(jwtSecret)).isTrue();
        assertThat(keys.isSettingsKey(settingsKey)).isTrue();
        assertThat(keys.isBackupKey(backupKey)).isTrue();
        assertThat(keys.backupKey()).contains(new BackupKey(backupKey));
    }

    @Test
    @DisplayName("Given the public secrets written another way, when compared, then they are still recognised")
    void should_recognise_the_keys_when_compared_given_another_spelling() {
        String settingsKey = developmentValue("app.operations.settings.key");
        String backupKey = developmentValue("app.operations.backup-key.value");

        assertThat(keys.isSettingsKey("  " + settingsKey.replace("=", "") + "\n")).isTrue();
        assertThat(keys.isBackupKey(" " + backupKey.toLowerCase(Locale.ROOT) + "\n")).isTrue();
        assertThat(keys.isJwtSecret(" " + developmentValue("app.security.jwt.secret") + "\n")).isTrue();
    }

    @Test
    @DisplayName("Given secrets a server generated for itself, when compared, then none is a public development secret")
    void should_not_recognise_the_keys_when_compared_given_a_server_s_own_keys() {
        assertThat(keys.isSettingsKey(SERVER_SETTINGS_KEY)).isFalse();
        assertThat(keys.isBackupKey(SERVER_BACKUP_KEY)).isFalse();
        assertThat(keys.isJwtSecret(SERVER_JWT_SECRET)).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "not base64 at all!", "c2hvcnQ=", "AGE-SECRET-KEY-1NOTAKEY"})
    @DisplayName("Given a missing or malformed value, when compared, then it is no public development key")
    void should_not_recognise_the_value_when_compared_given_a_malformed_value(String value) {
        assertThat(keys.isSettingsKey(value)).isFalse();
        assertThat(keys.isBackupKey(value)).isFalse();
        assertThat(keys.isJwtSecret(value)).isFalse();
    }

    static String developmentValue(String property) {
        AtomicReference<String> value = new AtomicReference<>();
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .run(context -> value.set(context.getEnvironment().getProperty(property)));
        return value.get();
    }
}
