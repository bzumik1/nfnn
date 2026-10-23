package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.util.List;

public class SettingsRejected extends RuleViolation {

    public static final String CODE = "operations/invalid-settings";

    private final List<SettingError> errors;

    public SettingsRejected(List<SettingError> errors) {
        super(CODE, "Some settings were refused");
        this.errors = List.copyOf(errors);
    }

    public List<SettingError> errors() {
        return errors;
    }
}
