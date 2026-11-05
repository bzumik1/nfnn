package cz.novanadeje.app.shared.application.version;

import java.util.Optional;

public record ExpectedVersion(Optional<String> value) {

    public static final int MAX_LENGTH = 64;
    public static final String UNMATCHABLE = "!";

    public ExpectedVersion {
        if (value == null) {
            throw new IllegalArgumentException("An expected version is a value or none, never null");
        }
        if (value.filter(version -> version.isBlank() || version.length() > MAX_LENGTH).isPresent()) {
            throw new IllegalArgumentException("An expected version holds 1 to " + MAX_LENGTH + " characters");
        }
    }

    public static ExpectedVersion none() {
        return new ExpectedVersion(Optional.empty());
    }

    public static ExpectedVersion of(String version) {
        return new ExpectedVersion(Optional.of(version));
    }

    public boolean admits(String current) {
        return value.map(current::equals).orElse(true);
    }
}
