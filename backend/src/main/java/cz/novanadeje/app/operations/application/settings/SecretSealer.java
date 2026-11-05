package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

public interface SecretSealer {

    boolean available();

    String seal(String purpose, String value);

    Optional<String> unseal(String purpose, String sealed);

    default String seal(Setting setting, String value) {
        return seal(setting.name(), value);
    }

    default Optional<String> unseal(Setting setting, String sealed) {
        return unseal(setting.name(), sealed);
    }
}
