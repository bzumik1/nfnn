package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupKind;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestoreFile;
import cz.novanadeje.app.operations.domain.backup.RestoreFileState;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

record AdminBackupsResponse(boolean available, List<Backup> backups, Run lastBackup, Run lastTestRestore, Run lastRestore,
                            List<RestoreEntry> restoreFiles, int pendingRequests, List<BackupProblem> problems) {

    static AdminBackupsResponse from(BackupAdministrationView view) {
        return new AdminBackupsResponse(view.available(), view.backups().stream().map(Backup::from).toList(), run(view.lastBackup()),
                run(view.lastTestRestore()), run(view.lastRestore()), view.restoreFiles().stream().map(RestoreEntry::from).toList(),
                view.pendingRequests(), view.health().problems().stream().sorted().toList());
    }

    private static Run run(Optional<BackupRun> run) {
        return run.map(Run::from).orElse(null);
    }

    record Backup(String fileName, BackupKind kind, long sizeBytes, Instant createdAt) {

        static Backup from(BackupFile file) {
            return new Backup(file.name(), file.kind(), file.sizeBytes(), file.createdAt());
        }
    }

    record Run(RunOutcome outcome, Instant startedAt, Instant finishedAt, String fileName, Long sizeBytes, Integer tables, String requestId, String error) {

        static Run from(BackupRun run) {
            return new Run(run.outcome(), run.startedAt(), run.finishedAt(), run.fileName().orElse(null), run.sizeBytes().orElse(null),
                    run.tables().orElse(null), run.requestId().orElse(null), run.error().orElse(null));
        }
    }

    record RestoreEntry(String fileName, RestoreFileState state, Instant changedAt) {

        static RestoreEntry from(RestoreFile file) {
            return new RestoreEntry(file.name(), file.state(), file.changedAt());
        }
    }
}
