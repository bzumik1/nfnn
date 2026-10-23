package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsKeyMissing;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SettingsWriterTest {

    private static final Instant NOW = Instant.parse("2026-10-23T16:00:00Z");

    private final InMemorySettingsRepository repository = new InMemorySettingsRepository();
    private final ReversibleSealer sealer = new ReversibleSealer();
    private final SettingsValidator validator = mock(SettingsValidator.class);
    private final SettingsWriter writer = new SettingsWriter(repository, sealer, validator);

    @Test
    @DisplayName("Given valid changes, when they are applied, then plain values are stored as they are and secrets only sealed")
    void should_store_plain_and_sealed_when_applied_given_valid_changes() {
        writer.apply(List.of(new SettingChange(Setting.MAIL_HOST, "smtp-relay.brevo.com"), new SettingChange(Setting.MAIL_PASSWORD, "key-123")),
                List.of(), NOW);

        assertThat(repository.find(Setting.MAIL_HOST)).contains(new StoredSetting(Setting.MAIL_HOST, "smtp-relay.brevo.com", false, NOW));
        StoredSetting password = repository.find(Setting.MAIL_PASSWORD).orElseThrow();
        assertThat(password.sealed()).isTrue();
        assertThat(password.value()).doesNotContain("key-123");
        assertThat(writer.storedValues()).containsEntry(Setting.MAIL_PASSWORD, "key-123");
    }

    @Test
    @DisplayName("Given a stored value, when the change has no value, then the setting goes back to its default")
    void should_delete_row_when_applied_given_reset() {
        repository.save(new StoredSetting(Setting.FIO_TOKEN, sealer.seal(Setting.FIO_TOKEN, "token"), true, NOW));

        writer.apply(List.of(new SettingChange(Setting.FIO_TOKEN, "")), List.of(), NOW);

        assertThat(repository.find(Setting.FIO_TOKEN)).isEmpty();
    }

    @Test
    @DisplayName("Given malformed values and a missing required one, when applied, then every problem is reported and nothing is stored")
    void should_report_problems_when_applied_given_malformed_and_missing_values() {
        assertThatThrownBy(() -> writer.apply(List.of(new SettingChange(Setting.PUBLIC_URL, "nfnn.cz"), new SettingChange(Setting.MAIL_PORT, "x")),
                List.of(Setting.PUBLIC_URL, Setting.MAIL_FROM), NOW))
                .isInstanceOfSatisfying(SettingsRejected.class, rejected -> assertThat(rejected.errors()).containsExactly(
                        SettingError.of(Setting.PUBLIC_URL, SettingProblem.INVALID_URL),
                        SettingError.of(Setting.MAIL_PORT, SettingProblem.INVALID_PORT),
                        SettingError.of(Setting.MAIL_FROM, SettingProblem.REQUIRED)));
        assertThat(repository.findAll()).isEmpty();
        verify(validator, never()).validate(anyMap(), anyMap(), anySet());
    }

    @Test
    @DisplayName("Given well-formed values the startup would refuse, when applied, then the validator's errors are reported and nothing is stored")
    void should_report_startup_refusal_when_applied_given_validator_errors() {
        when(validator.validate(any(), any(), any())).thenReturn(List.of(SettingError.of(Setting.RECEIPT_FIRST_YEAR, SettingProblem.REJECTED_AT_STARTUP)));

        assertThatThrownBy(() -> writer.apply(List.of(new SettingChange(Setting.RECEIPT_FIRST_YEAR, "2099")), List.of(), NOW))
                .isInstanceOf(SettingsRejected.class);
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("Given stored values, when a change is validated, then the validator sees the stored and the resulting values and what changed")
    void should_pass_stored_and_candidate_when_validated_given_stored_values() {
        repository.save(new StoredSetting(Setting.MAIL_HOST, "old.example.cz", false, NOW));
        repository.save(new StoredSetting(Setting.MAIL_PORT, "25", false, NOW));

        writer.apply(List.of(new SettingChange(Setting.MAIL_PORT, "587"), new SettingChange(Setting.MAIL_HOST, null)), List.of(), NOW);

        verify(validator).validate(Map.of(Setting.MAIL_HOST, "old.example.cz", Setting.MAIL_PORT, "25"), Map.of(Setting.MAIL_PORT, "587"),
                Set.of(Setting.MAIL_PORT, Setting.MAIL_HOST));
    }

    @Test
    @DisplayName("Given no settings key, when a secret is applied, then it is refused and nothing is stored")
    void should_refuse_secret_when_applied_given_no_key() {
        sealer.withoutKey();

        assertThatThrownBy(() -> writer.apply(List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"), new SettingChange(Setting.FIO_TOKEN, "t")),
                List.of(), NOW)).isInstanceOf(SettingsKeyMissing.class);
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("Given a secret sealed with another key, when values are read, then it counts as unreadable and not as stored")
    void should_report_unreadable_when_read_given_secret_of_another_key() {
        repository.save(new StoredSetting(Setting.FIO_TOKEN, sealer.seal(Setting.FIO_TOKEN, "token"), true, NOW));
        sealer.withAnotherKey();

        assertThat(writer.storedValues()).doesNotContainKey(Setting.FIO_TOKEN);
        assertThat(writer.unreadable()).containsExactly(Setting.FIO_TOKEN);
    }
}
