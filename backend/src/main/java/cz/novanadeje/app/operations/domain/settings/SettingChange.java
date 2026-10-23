package cz.novanadeje.app.operations.domain.settings;

public record SettingChange(Setting setting, String value) {

    public SettingChange {
        if (setting == null) {
            throw new IllegalArgumentException("A setting change names the setting");
        }
        value = value == null || value.isBlank() ? null : value.strip();
    }

    public boolean resetsToDefault() {
        return value == null;
    }

    @Override
    public String toString() {
        String shown = resetsToDefault() ? "default" : setting.secret() ? "********" : value;
        return "SettingChange[" + setting + "=" + shown + "]";
    }
}
