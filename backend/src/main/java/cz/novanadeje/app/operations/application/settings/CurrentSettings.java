package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

public interface CurrentSettings {

    Optional<String> effectiveValue(Setting setting);
}
