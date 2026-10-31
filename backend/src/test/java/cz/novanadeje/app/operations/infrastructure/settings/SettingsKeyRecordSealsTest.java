package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsKeyRecordSealsTest {

    private static final Instant NOW = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SETTINGS_KEY = Base64.getEncoder().encodeToString("settings-key-of-thirty-two-byte!".getBytes(StandardCharsets.US_ASCII));
    private static final String OTHER_SETTINGS_KEY = Base64.getEncoder().encodeToString("another-key-of-thirty-two-bytes!".getBytes(StandardCharsets.US_ASCII));
    private static final String BACKUP_KEY = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";
    private static final String PURPOSE = "receipt-signing-key";
    private static final byte[] CONTENT = "21fe31df\nd75a\n2026-10-30T09:00:00Z\nactive".getBytes(StandardCharsets.UTF_8);

    @Test
    @DisplayName("Given a record sealed on this server, when its seal is checked, then it is sealed here, and changed content, purpose or seal breaks it")
    void should_find_seal_here_and_broken_when_changed_given_record_sealed_on_this_server() {
        SettingsKeyRecordSeals seals = seals(SETTINGS_KEY, Optional.empty());

        String seal = seals.seal(PURPOSE, CONTENT);

        assertThat(seal).startsWith("v1:");
        assertThat(seals.check(PURPOSE, CONTENT, seal)).isEqualTo(SealVerdict.SEALED_HERE);
        assertThat(seals.check(PURPOSE, "21fe31df\nd75a\n2026-10-30T09:00:00Z\nrevoked".getBytes(StandardCharsets.UTF_8), seal)).isEqualTo(SealVerdict.BROKEN);
        assertThat(seals.check("another-purpose", CONTENT, seal)).isEqualTo(SealVerdict.BROKEN);
        assertThat(seals.check(PURPOSE, CONTENT, "v1:" + Base64.getEncoder().encodeToString(new byte[32]))).isEqualTo(SealVerdict.BROKEN);
        assertThat(seals.check(PURPOSE, CONTENT, "not a seal")).isEqualTo(SealVerdict.BROKEN);
    }

    @Test
    @DisplayName("Given a record sealed on an earlier server whose settings key the backup carries, when a new server checks it, then it is sealed by the carried key")
    void should_find_seal_by_carried_key_when_checked_given_record_of_earlier_server() {
        CarriedSettingsKey carried = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).carryCurrentKey(NOW);
        String seal = seals(SETTINGS_KEY, Optional.empty()).seal(PURPOSE, CONTENT);

        SettingsKeyRecordSeals newServer = seals(OTHER_SETTINGS_KEY, Optional.of(carried));

        assertThat(newServer.check(PURPOSE, CONTENT, seal)).isEqualTo(SealVerdict.SEALED_BY_CARRIED_KEY);
        assertThat(newServer.check(PURPOSE, CONTENT, newServer.seal(PURPOSE, CONTENT))).isEqualTo(SealVerdict.SEALED_HERE);
    }

    @Test
    @DisplayName("Given a record sealed under another settings key that no backup carries, when it is checked, then the seal is broken")
    void should_find_seal_broken_when_checked_given_other_settings_key_not_carried() {
        String seal = seals(OTHER_SETTINGS_KEY, Optional.empty()).seal(PURPOSE, CONTENT);
        CarriedSettingsKey ownCarried = BackupKeySettingsKeyCarrier.of(SETTINGS_KEY, BACKUP_KEY).carryCurrentKey(NOW);

        assertThat(seals(SETTINGS_KEY, Optional.empty()).check(PURPOSE, CONTENT, seal)).isEqualTo(SealVerdict.BROKEN);
        assertThat(seals(SETTINGS_KEY, Optional.of(ownCarried)).check(PURPOSE, CONTENT, seal)).isEqualTo(SealVerdict.BROKEN);
    }

    private static SettingsKeyRecordSeals seals(String settingsKey, Optional<CarriedSettingsKey> carried) {
        return new SettingsKeyRecordSeals(BackupKeySettingsKeyCarrier.of(settingsKey, BACKUP_KEY), new StoredCarriedKey(carried));
    }

    private record StoredCarriedKey(Optional<CarriedSettingsKey> stored) implements CarriedSettingsKeyRepository {

        @Override
        public Optional<CarriedSettingsKey> find() {
            return stored;
        }

        @Override
        public void save(CarriedSettingsKey key) {
            throw new UnsupportedOperationException("A seal check never stores a carried key");
        }
    }
}
