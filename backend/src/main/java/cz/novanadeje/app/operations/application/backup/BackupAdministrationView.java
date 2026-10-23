package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public record BackupAdministrationView(boolean available, List<BackupFile> backups, Optional<BackupRun> lastBackup, Optional<BackupRun> lastTestRestore,
                                       Optional<BackupRun> lastRestore, List<RestoreFile> restoreFiles, int pendingRequests, BackupHealth health) {

    public BackupAdministrationView {
        backups = List.copyOf(backups);
        restoreFiles = List.copyOf(restoreFiles);
        Objects.requireNonNull(lastBackup, "lastBackup");
        Objects.requireNonNull(lastTestRestore, "lastTestRestore");
        Objects.requireNonNull(lastRestore, "lastRestore");
        Objects.requireNonNull(health, "health");
    }

    public static BackupAdministrationView unavailable() {
        return new BackupAdministrationView(false, List.of(), Optional.empty(), Optional.empty(), Optional.empty(), List.of(), 0, BackupHealth.unavailable());
    }
}
