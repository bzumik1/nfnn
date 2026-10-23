package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

public interface SecretSealer {

    boolean available();

    String seal(Setting setting, String value);

    Optional<String> unseal(Setting setting, String sealed);
}
