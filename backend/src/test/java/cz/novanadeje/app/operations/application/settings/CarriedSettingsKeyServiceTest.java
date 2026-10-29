package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class CarriedSettingsKeyServiceTest {

    private static final Instant STORED = Instant.parse("2026-10-20T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-29T16:00:00Z");
    private static final CarriedSettingsKey CURRENT = new CarriedSettingsKey("wrapped current", NOW);
    private static final CarriedSettingsKey OLD = new CarriedSettingsKey("wrapped old", STORED);

    private final InMemorySettingsRepository settings = new InMemorySettingsRepository();
    private final InMemoryCarriedSettingsKeys carried = new InMemoryCarriedSettingsKeys();
    private final ReversibleSealer sealer = new ReversibleSealer("current:");
    private final ReversibleSealer oldSealer = new ReversibleSealer("old:");
    private final FakeCarrier carrier = new FakeCarrier();
    private final CarriedSettingsKeyService service = new CarriedSettingsKeyService(settings, carried, sealer, carrier,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given no settings key carried yet, when the backend starts, then the current key is carried for the backups and nothing is sealed again")
    void should_carry_current_key_when_started_given_nothing_carried() {
        settings.save(new StoredSetting(Setting.MAIL_PASSWORD, sealer.seal(Setting.MAIL_PASSWORD, "smtp-key"), true, STORED));

        assertThat(service.carryIntoBackups()).isZero();

        assertThat(carried.find()).contains(CURRENT);
        assertThat(settings.findAll()).extracting(StoredSetting::value).containsExactly(sealer.seal(Setting.MAIL_PASSWORD, "smtp-key"));
    }

    @Test
    @DisplayName("Given the current key already carried, when the backend starts, then it is kept as it is")
    void should_keep_carried_key_when_started_given_current_key_carried() {
        CarriedSettingsKey earlier = new CarriedSettingsKey("wrapped current", STORED);
        carried.save(earlier);

        service.carryIntoBackups();

        assertThat(carried.find()).contains(earlier);
    }

    @Test
    @DisplayName("Given secrets restored from another server with its key carried, when the backend starts, then they are sealed again with this key and this key is carried")
    void should_seal_again_when_started_given_secrets_of_carried_key() {
        carried.save(OLD);
        settings.save(new StoredSetting(Setting.MAIL_PASSWORD, oldSealer.seal(Setting.MAIL_PASSWORD, "smtp-key"), true, STORED));
        settings.save(new StoredSetting(Setting.FIO_TOKEN, oldSealer.seal(Setting.FIO_TOKEN, "fio-token"), true, STORED));
        settings.save(new StoredSetting(Setting.MAIL_HOST, "smtp-relay.brevo.com", false, STORED));

        assertThat(service.carryIntoBackups()).isEqualTo(2);

        assertThat(settings.findAll()).containsExactlyInAnyOrder(
                new StoredSetting(Setting.MAIL_PASSWORD, sealer.seal(Setting.MAIL_PASSWORD, "smtp-key"), true, STORED),
                new StoredSetting(Setting.FIO_TOKEN, sealer.seal(Setting.FIO_TOKEN, "fio-token"), true, STORED),
                new StoredSetting(Setting.MAIL_HOST, "smtp-relay.brevo.com", false, STORED));
        assertThat(carried.find()).contains(CURRENT);
    }

    @Test
    @DisplayName("Given a carried key this backup key cannot open, when the backend starts, then unreadable secrets stay for the administrator and this key is carried")
    void should_leave_secrets_when_started_given_carried_key_unreadable() {
        carried.save(new CarriedSettingsKey("wrapped for another backup key", STORED));
        StoredSetting lost = new StoredSetting(Setting.FIO_TOKEN, oldSealer.seal(Setting.FIO_TOKEN, "fio-token"), true, STORED);
        settings.save(lost);

        assertThat(service.carryIntoBackups()).isZero();

        assertThat(settings.findAll()).containsExactly(lost);
        assertThat(carried.find()).contains(CURRENT);
    }

    @Test
    @DisplayName("Given no backup key or no settings key, when the backend starts, then nothing is carried")
    void should_carry_nothing_when_started_given_keys_missing() {
        carrier.available = false;

        assertThat(service.carryIntoBackups()).isZero();

        assertThat(carried.find()).isEmpty();
    }

    private final class FakeCarrier implements SettingsKeyCarrier {

        private boolean available = true;

        @Override
        public boolean available() {
            return available;
        }

        @Override
        public CarriedSettingsKey carryCurrentKey(Instant at) {
            return new CarriedSettingsKey(CURRENT.wrapped(), at);
        }

        @Override
        public boolean carriesCurrentKey(CarriedSettingsKey key) {
            return key.wrapped().equals(CURRENT.wrapped());
        }

        @Override
        public Optional<SecretSealer> sealerOf(CarriedSettingsKey key) {
            return Optional.ofNullable(Map.<String, SecretSealer>of(CURRENT.wrapped(), sealer, OLD.wrapped(), oldSealer).get(key.wrapped()));
        }
    }
}
