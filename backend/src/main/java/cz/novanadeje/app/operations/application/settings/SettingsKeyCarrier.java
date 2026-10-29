package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;

import java.time.Instant;
import java.util.Optional;

public interface SettingsKeyCarrier {

    boolean available();

    CarriedSettingsKey carryCurrentKey(Instant at);

    boolean carriesCurrentKey(CarriedSettingsKey carried);

    Optional<SecretSealer> sealerOf(CarriedSettingsKey carried);
}
