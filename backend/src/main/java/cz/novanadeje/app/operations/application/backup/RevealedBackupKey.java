package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;

import java.util.Objects;

public record RevealedBackupKey(BackupKey key, BackupKeyWordPositions checkPositions) {

    public RevealedBackupKey {
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(checkPositions, "checkPositions");
    }
}
