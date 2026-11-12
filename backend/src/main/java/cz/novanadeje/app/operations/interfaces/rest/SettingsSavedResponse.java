package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SavedSettings;

import java.util.List;

record SettingsSavedResponse(List<String> changed, boolean restarting, String version) {

    static SettingsSavedResponse of(SavedSettings saved) {
        return new SettingsSavedResponse(saved.changed().stream().map(Enum::name).toList(), !saved.changed().isEmpty(), saved.version());
    }
}
