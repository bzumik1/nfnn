package cz.novanadeje.app.operations.application.event;

import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRun;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record BackupProblemsDetected(Set<BackupProblem> problems, Optional<BackupRun> lastBackup, Optional<BackupRun> lastTestRestore, Instant detectedAt) {

    public BackupProblemsDetected {
        if (problems == null || problems.isEmpty()) {
            throw new IllegalArgumentException("A detection names at least one problem");
        }
        problems = Set.copyOf(problems);
        Objects.requireNonNull(lastBackup, "lastBackup");
        Objects.requireNonNull(lastTestRestore, "lastTestRestore");
        Objects.requireNonNull(detectedAt, "detectedAt");
    }
}
