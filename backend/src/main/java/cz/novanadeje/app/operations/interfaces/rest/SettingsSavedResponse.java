package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.List;

record SettingsSavedResponse(List<String> changed, boolean restarting) {

    static SettingsSavedResponse of(List<Setting> changed) {
        return new SettingsSavedResponse(changed.stream().map(Enum::name).toList(), !changed.isEmpty());
    }
}
