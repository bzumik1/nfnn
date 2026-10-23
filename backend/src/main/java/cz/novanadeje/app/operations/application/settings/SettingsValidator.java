package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingError;

import java.util.List;
import java.util.Map;
import java.util.Set;

public interface SettingsValidator {

    List<SettingError> validate(Map<Setting, String> stored, Map<Setting, String> candidate, Set<Setting> changed);
}
