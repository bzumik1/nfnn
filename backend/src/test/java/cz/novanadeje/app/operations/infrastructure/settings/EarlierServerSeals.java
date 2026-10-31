package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;

import java.time.Instant;
import java.util.Optional;

public final class EarlierServerSeals {

    private final BackupKeySettingsKeyCarrier carrier;

    private EarlierServerSeals(BackupKeySettingsKeyCarrier carrier) {
        this.carrier = carrier;
    }

    public static EarlierServerSeals of(String settingsKey, String backupKey) {
        return new EarlierServerSeals(BackupKeySettingsKeyCarrier.of(settingsKey, backupKey));
    }

    public String carriedSettingsKey(Instant at) {
        return carrier.carryCurrentKey(at).wrapped();
    }

    public String seal(String purpose, byte[] content) {
        return new SettingsKeyRecordSeals(carrier, new NothingCarried()).seal(purpose, content);
    }

    private static final class NothingCarried implements CarriedSettingsKeyRepository {

        @Override
        public Optional<CarriedSettingsKey> find() {
            return Optional.empty();
        }

        @Override
        public void save(CarriedSettingsKey key) {
            throw new UnsupportedOperationException("An earlier server's seal stores nothing");
        }
    }
}
