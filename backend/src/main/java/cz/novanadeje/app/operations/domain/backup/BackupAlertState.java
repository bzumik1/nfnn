package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record BackupAlertState(Set<BackupProblem> reportedProblems, Optional<Instant> reportedAt) {

    public BackupAlertState {
        Objects.requireNonNull(reportedAt, "reportedAt");
        reportedProblems = reportedProblems.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(reportedProblems));
        if (reportedProblems.isEmpty() != reportedAt.isEmpty()) {
            throw new IllegalArgumentException("Reported problems and the time they were reported go together");
        }
    }

    public static BackupAlertState nothingReported() {
        return new BackupAlertState(Set.of(), Optional.empty());
    }

    public static BackupAlertState reported(Set<BackupProblem> problems, Instant at) {
        return new BackupAlertState(problems, Optional.of(at));
    }

    public boolean reporting() {
        return !reportedProblems.isEmpty();
    }
}
