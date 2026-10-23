package cz.novanadeje.app.operations.domain.settings;

import java.util.Optional;

public record SettingError(Optional<Setting> setting, SettingProblem problem) {

    public static SettingError of(Setting setting, SettingProblem problem) {
        return new SettingError(Optional.of(setting), problem);
    }

    public static SettingError ofWhole(SettingProblem problem) {
        return new SettingError(Optional.empty(), problem);
    }
}
