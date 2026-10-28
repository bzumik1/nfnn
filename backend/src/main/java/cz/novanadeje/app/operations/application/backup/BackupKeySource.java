package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;

import java.util.Optional;

public interface BackupKeySource {

    Optional<BackupKey> current();
}
