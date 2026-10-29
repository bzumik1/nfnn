package cz.novanadeje.app.operations.application.backup;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public record BackupKeyView(boolean available, boolean confirmed, Optional<Instant> confirmedAt) {

    public BackupKeyView {
        Objects.requireNonNull(confirmedAt, "confirmedAt");
    }

    static BackupKeyView unavailable() {
        return new BackupKeyView(false, false, Optional.empty());
    }
}
