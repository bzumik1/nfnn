package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SettingsKeyMissing extends Conflict {

    public static final String CODE = "operations/settings-key-missing";

    public SettingsKeyMissing() {
        super(CODE, "Secret settings cannot be stored without the settings key (SETTINGS_KEY)");
    }
}
