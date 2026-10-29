package cz.novanadeje.app.operations.domain.settings;

import java.time.Instant;

public record CarriedSettingsKey(String wrapped, Instant storedAt) {

    public static final int MAX_LENGTH = 120;

    public CarriedSettingsKey {
        if (wrapped == null || wrapped.isBlank() || wrapped.length() > MAX_LENGTH || storedAt == null) {
            throw new IllegalArgumentException("A carried settings key is the wrapped key and the time it was stored");
        }
    }

    @Override
    public String toString() {
        return "CarriedSettingsKey[storedAt=" + storedAt + "]";
    }
}
