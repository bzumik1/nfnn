package cz.novanadeje.app.shared.application.restore;

import java.time.Instant;
import java.util.Objects;

public record FinishedRestore(String id, Instant finishedAt) {

    public static final int MAX_ID_LENGTH = 40;

    public FinishedRestore {
        Objects.requireNonNull(finishedAt, "finishedAt");
        if (id == null || id.isBlank() || id.length() > MAX_ID_LENGTH) {
            throw new IllegalArgumentException("A finished restore is named by an id of at most " + MAX_ID_LENGTH + " characters");
        }
    }
}
