package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.Objects;

public record RestoreFile(String name, RestoreFileState state, Instant changedAt) {

    public RestoreFile {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(changedAt, "changedAt");
    }

    public boolean pending() {
        return state == RestoreFileState.PENDING;
    }
}
