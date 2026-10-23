package cz.novanadeje.app.operations.domain.settings;

import java.time.Instant;

public record StoredSetting(Setting setting, String value, boolean sealed, Instant updatedAt) {

    public StoredSetting {
        if (setting == null || value == null || updatedAt == null) {
            throw new IllegalArgumentException("A stored setting has a name, a value and the time it was stored");
        }
        if (setting.secret() && !sealed) {
            throw new IllegalArgumentException("A secret setting is stored only sealed");
        }
    }

    @Override
    public String toString() {
        return "StoredSetting[" + setting + (sealed ? "=sealed" : "=" + value) + "]";
    }
}
