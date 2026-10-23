package cz.novanadeje.app.operations.application.event;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

public record BackupProblemsDetected(Set<BackupProblem> problems, BackupAdministrationView view, Instant detectedAt) {

    public BackupProblemsDetected {
        if (problems == null || problems.isEmpty()) {
            throw new IllegalArgumentException("A detection names at least one problem");
        }
        problems = Set.copyOf(problems);
        Objects.requireNonNull(view, "view");
        Objects.requireNonNull(detectedAt, "detectedAt");
    }
}
