package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

record SettingValueRequest(@NotBlank @Size(max = MAX_NAME_LENGTH) String name, @Size(max = MAX_VALUE_LENGTH) String value) {

    static final int MAX_NAME_LENGTH = 64;
    static final int MAX_VALUE_LENGTH = 2000;
    static final int MAX_SETTINGS = 30;

    SettingChange toChange() {
        Setting setting = Setting.named(name).orElseThrow(() -> new SettingsRejected(List.of(SettingError.ofWhole(SettingProblem.UNKNOWN_SETTING))));
        return new SettingChange(setting, value);
    }

    static List<SettingChange> toChanges(List<SettingValueRequest> requests) {
        return requests == null ? List.of() : requests.stream().map(SettingValueRequest::toChange).toList();
    }

    @Override
    public String toString() {
        return "SettingValueRequest[" + name + "]";
    }
}
