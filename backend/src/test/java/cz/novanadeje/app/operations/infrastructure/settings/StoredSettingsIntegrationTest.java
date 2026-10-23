package cz.novanadeje.app.operations.infrastructure.settings;

import com.zaxxer.hikari.HikariDataSource;
import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.operations.application.settings.SettingsValidator;
import cz.novanadeje.app.operations.application.settings.SettingsWriter;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-",
        "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
class StoredSettingsIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-10-23T16:00:00Z");

    @Autowired
    private SettingsValidator validator;

    @Autowired
    private SettingsWriter writer;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private org.springframework.core.env.Environment environment;

    @AfterEach
    void clean() {
        jdbc.sql("delete from operations_setting").update();
    }

    @Test
    @DisplayName("Given values the running backend would accept, when validated as at startup, then nothing is refused")
    void should_accept_when_validated_given_values_startup_accepts() {
        Map<Setting, String> candidate = Map.of(Setting.PUBLIC_URL, "https://nfnn.znamenacek.duckdns.org", Setting.MAIL_PORT, "587",
                Setting.PAIRING_EXCLUDED_ACCOUNTS, "2400000002/2010", Setting.FIO_HISTORY_FROM, "2025-01-01");

        assertThat(validator.validate(Map.of(), candidate, candidate.keySet())).isEmpty();
    }

    @Test
    @DisplayName("Given an excluded account the startup would refuse, when validated as at startup, then that setting is named")
    void should_name_setting_when_validated_given_value_startup_refuses() {
        Map<Setting, String> candidate = Map.of(Setting.MAIL_PORT, "587", Setting.PAIRING_EXCLUDED_ACCOUNTS, "not-an-account");

        assertThat(validator.validate(Map.of(), candidate, Set.of(Setting.MAIL_PORT, Setting.PAIRING_EXCLUDED_ACCOUNTS)))
                .containsExactly(SettingError.of(Setting.PAIRING_EXCLUDED_ACCOUNTS, SettingProblem.REJECTED_AT_STARTUP));
    }

    @Test
    @DisplayName("Given stored plain and secret settings, when the next start reads them, then they override the defaults and the secret is readable")
    void should_load_settings_when_started_given_stored_settings() throws SQLException {
        transactions.executeWithoutResult(status -> writer.apply(List.of(new SettingChange(Setting.PUBLIC_URL, "https://nfnn.znamenacek.duckdns.org"),
                new SettingChange(Setting.FIO_TOKEN, "fio-token")), List.of(), NOW));

        MockEnvironment next = nextStart(environment.getProperty(DatabaseSettingsEnvironmentPostProcessor.KEY_PROPERTY));
        new DatabaseSettingsEnvironmentPostProcessor(destination -> destination.get()).postProcessEnvironment(next, null);

        assertThat(next.getProperty("PUBLIC_URL")).isEqualTo("https://nfnn.znamenacek.duckdns.org");
        assertThat(next.getProperty("FIO_TOKEN")).isEqualTo("fio-token");
        assertThat(next.getPropertySources().iterator().next().getName()).isEqualTo(DatabaseSettingsEnvironmentPostProcessor.SOURCE_NAME);
    }

    @Test
    @DisplayName("Given a secret stored with another key, when the next start reads the settings, then the secret is left out and the rest loads")
    void should_skip_secret_when_started_given_other_key() throws SQLException {
        transactions.executeWithoutResult(status -> writer.apply(List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"),
                new SettingChange(Setting.MAIL_PASSWORD, "password")), List.of(), NOW));

        MockEnvironment next = nextStart(Base64.getEncoder().encodeToString("another-key-of-thirty-two-bytes!".getBytes()));
        new DatabaseSettingsEnvironmentPostProcessor(destination -> destination.get()).postProcessEnvironment(next, null);

        assertThat(next.getProperty("MAIL_HOST")).isEqualTo("smtp.example.cz");
        assertThat(next.getProperty("MAIL_PASSWORD")).isNull();
    }

    @Test
    @DisplayName("Given stored settings off, when the start reads the settings, then the database is not asked")
    void should_skip_when_started_given_switch_off() {
        MockEnvironment next = new MockEnvironment().withProperty("spring.datasource.url", "jdbc:postgresql://nowhere.invalid/x");

        new DatabaseSettingsEnvironmentPostProcessor(destination -> destination.get()).postProcessEnvironment(next, null);

        assertThat(next.getPropertySources().contains(DatabaseSettingsEnvironmentPostProcessor.SOURCE_NAME)).isFalse();
    }

    @Test
    @DisplayName("Given an unreachable database, when the start reads the settings, then the start fails instead of running on defaults")
    void should_fail_start_when_started_given_unreachable_database() {
        MockEnvironment next = new MockEnvironment()
                .withProperty(DatabaseSettingsEnvironmentPostProcessor.ENABLED_PROPERTY, "true")
                .withProperty("spring.datasource.url", "jdbc:postgresql://127.0.0.1:1/nfnn")
                .withProperty("spring.datasource.username", "nfnn")
                .withProperty("spring.datasource.password", "nfnn");

        assertThatThrownBy(() -> new DatabaseSettingsEnvironmentPostProcessor(destination -> destination.get()).postProcessEnvironment(next, null))
                .isInstanceOf(IllegalStateException.class);
    }

    private MockEnvironment nextStart(String key) throws SQLException {
        HikariDataSource hikari = dataSource.unwrap(HikariDataSource.class);
        return new MockEnvironment()
                .withProperty(DatabaseSettingsEnvironmentPostProcessor.ENABLED_PROPERTY, "true")
                .withProperty(DatabaseSettingsEnvironmentPostProcessor.KEY_PROPERTY, key)
                .withProperty("spring.datasource.url", hikari.getJdbcUrl())
                .withProperty("spring.datasource.username", hikari.getUsername())
                .withProperty("spring.datasource.password", hikari.getPassword());
    }
}
