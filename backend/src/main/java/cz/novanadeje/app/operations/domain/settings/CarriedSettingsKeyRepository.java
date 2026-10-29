package cz.novanadeje.app.operations.domain.settings;

import java.util.Optional;

public interface CarriedSettingsKeyRepository {

    Optional<CarriedSettingsKey> find();

    void save(CarriedSettingsKey key);
}
