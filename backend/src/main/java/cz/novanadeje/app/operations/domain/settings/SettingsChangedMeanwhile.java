package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.StaleWrite;

public class SettingsChangedMeanwhile extends StaleWrite {

    public static final String CODE = "operations/changed-meanwhile";

    public SettingsChangedMeanwhile(String version) {
        super(CODE, "The settings changed since the version the request names", version);
    }
}
