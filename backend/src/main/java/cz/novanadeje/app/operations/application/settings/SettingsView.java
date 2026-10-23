package cz.novanadeje.app.operations.application.settings;

import java.util.List;

public record SettingsView(List<SettingView> settings, boolean secretsCanBeStored) {

    public SettingsView {
        settings = List.copyOf(settings);
    }
}
