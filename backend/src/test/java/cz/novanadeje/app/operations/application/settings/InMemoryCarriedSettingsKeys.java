package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;

import java.util.Optional;

class InMemoryCarriedSettingsKeys implements CarriedSettingsKeyRepository {

    private Optional<CarriedSettingsKey> key = Optional.empty();

    @Override
    public Optional<CarriedSettingsKey> find() {
        return key;
    }

    @Override
    public void save(CarriedSettingsKey key) {
        this.key = Optional.of(key);
    }
}
