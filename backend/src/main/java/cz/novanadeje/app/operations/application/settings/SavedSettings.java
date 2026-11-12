package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.List;

public record SavedSettings(List<Setting> changed, String version) {

    public SavedSettings {
        if (changed == null || version == null) {
            throw new IllegalArgumentException("Saved settings name what changed and the version they left");
        }
        changed = List.copyOf(changed);
    }
}
