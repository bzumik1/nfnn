package cz.novanadeje.app.operations.application.event;

import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRun;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record BackupRecovered(Set<BackupProblem> resolvedProblems, Optional<BackupRun> lastBackup, Optional<BackupRun> lastTestRestore, Instant recoveredAt) {

    public BackupRecovered {
        if (resolvedProblems == null || resolvedProblems.isEmpty()) {
            throw new IllegalArgumentException("A recovery names the problems that ended");
        }
        resolvedProblems = Set.copyOf(resolvedProblems);
        Objects.requireNonNull(lastBackup, "lastBackup");
        Objects.requireNonNull(lastTestRestore, "lastTestRestore");
        Objects.requireNonNull(recoveredAt, "recoveredAt");
    }
}
