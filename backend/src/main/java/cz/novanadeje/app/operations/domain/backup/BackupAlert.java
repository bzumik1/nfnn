package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;

public sealed interface BackupAlert permits BackupAlert.ProblemsDetected, BackupAlert.Recovered {

    Set<BackupProblem> problems();

    Instant occurredAt();

    record ProblemsDetected(Set<BackupProblem> problems, Instant occurredAt) implements BackupAlert {

        public ProblemsDetected {
            if (problems == null || problems.isEmpty() || occurredAt == null) {
                throw new IllegalArgumentException("A detection names at least one problem and when it was detected");
            }
            problems = Set.copyOf(EnumSet.copyOf(problems));
        }
    }

    record Recovered(Set<BackupProblem> problems, Instant occurredAt) implements BackupAlert {

        public Recovered {
            if (problems == null || problems.isEmpty() || occurredAt == null) {
                throw new IllegalArgumentException("A recovery names the problems that ended and when they did");
            }
            problems = Set.copyOf(EnumSet.copyOf(problems));
        }
    }
}
