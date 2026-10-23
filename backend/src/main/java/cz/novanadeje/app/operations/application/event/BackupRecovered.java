package cz.novanadeje.app.operations.application.event;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

public record BackupRecovered(Set<BackupProblem> resolvedProblems, BackupAdministrationView view, Instant recoveredAt) {

    public BackupRecovered {
        if (resolvedProblems == null || resolvedProblems.isEmpty()) {
            throw new IllegalArgumentException("A recovery names the problems that ended");
        }
        resolvedProblems = Set.copyOf(resolvedProblems);
        Objects.requireNonNull(view, "view");
        Objects.requireNonNull(recoveredAt, "recoveredAt");
    }
}
