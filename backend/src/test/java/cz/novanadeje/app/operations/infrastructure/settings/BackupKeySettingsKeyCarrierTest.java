package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.Setting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class BackupKeySettingsKeyCarrierTest {

    private static final Instant NOW = Instant.parse("2026-10-29T16:00:00Z");
    private static final String SETTINGS_KEY = Base64.getEncoder().encodeToString("settings-key-of-thirty-two-byte!".getBytes());
    private static final String OTHER_SETTINGS_KEY = Base64.getEncoder().encodeToString("another-key-of-thirty-two-bytes!".getBytes());
    private static final String BACKUP_KEY = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";
    private static final String OTHER_BACKUP_KEY = "AGE-SECRET-KEY-1ARXU2VF0GAFA8YLTUXNPDZE0UV33WNCJJEUWM3C2RKSR7A829JTS8HRKXT";

    @Test
    @DisplayName("Given a settings key carried under a backup key, when another server with that backup key opens it, then it reads the secrets of the first server")
    void should_read_old_secrets_when_opened_given_same_backup_key() {
        CarriedSettingsKey carried = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).carryCurrentKey(NOW);
        String sealed = AesGcmSecretSealer.fromKey(SETTINGS_KEY).seal(Setting.MAIL_PASSWORD, "smtp-key");

        BackupKeySettingsKeyCarrier newServer = BackupKeySettingsKeyCarrier.of(OTHER_SETTINGS_KEY, BACKUP_KEY.toLowerCase());

        assertThat(carried.storedAt()).isEqualTo(NOW);
        assertThat(carried.wrapped()).startsWith("v1:").hasSizeLessThanOrEqualTo(CarriedSettingsKey.MAX_LENGTH);
        assertThat(newServer.sealerOf(carried).flatMap(old -> old.unseal(Setting.MAIL_PASSWORD, sealed))).contains("smtp-key");
        assertThat(newServer.carriesCurrentKey(carried)).isFalse();
        assertThat(BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).carriesCurrentKey(carried)).isTrue();
    }

    @Test
    @DisplayName("Given a settings key carried under one backup key, when it is opened with another backup key or altered, then nothing can be read")
    void should_open_nothing_when_opened_given_other_backup_key_or_altered() {
        CarriedSettingsKey carried = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).carryCurrentKey(NOW);
        BackupKeySettingsKeyCarrier other = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, OTHER_BACKUP_KEY);
        BackupKeySettingsKeyCarrier same = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY);

        assertThat(other.sealerOf(carried)).isEmpty();
        assertThat(other.carriesCurrentKey(carried)).isFalse();
        assertThat(same.sealerOf(new CarriedSettingsKey("v1:garbage", NOW))).isEmpty();
        assertThat(same.sealerOf(new CarriedSettingsKey("plain", NOW))).isEmpty();
        assertThat(same.sealerOf(new CarriedSettingsKey(carried.wrapped().substring(0, carried.wrapped().length() - 4) + "AAAA", NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given the same settings key carried twice, when compared, then the wrapped texts differ and hide the key")
    void should_differ_when_carried_given_same_key_twice() {
        BackupKeySettingsKeyCarrier carrier = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY);

        String first = carrier.carryCurrentKey(NOW).wrapped();

        assertThat(first).isNotEqualTo(carrier.carryCurrentKey(NOW).wrapped()).doesNotContain(SETTINGS_KEY);
    }

    @Test
    @DisplayName("Given no backup key, no settings key or an invalid backup key, when asked, then nothing can be carried")
    void should_be_unavailable_when_asked_given_a_key_missing() {
        assertThat(BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, null).available()).isFalse();
        assertThat(BackupKeySettingsKeyCarrier.of(null, BACKUP_KEY).available()).isFalse();
        assertThat(BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, "AGE-SECRET-KEY-1NOTAKEY").available()).isFalse();
        assertThat(BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).available()).isTrue();
    }
}
