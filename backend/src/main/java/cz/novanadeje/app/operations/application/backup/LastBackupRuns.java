package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupRun;

import java.util.Optional;

public record LastBackupRuns(Optional<BackupRun> backup, Optional<BackupRun> testRestore) {

    public LastBackupRuns {
        if (backup == null || testRestore == null) {
            throw new IllegalArgumentException("The last backup and the last test restore are required, each possibly absent");
        }
    }
}
