package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public record BackupHealth(Set<BackupProblem> problems) {

    public BackupHealth {
        problems = problems.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(problems));
    }

    public static BackupHealth noProblems() {
        return new BackupHealth(Set.of());
    }

    public static BackupHealth unavailable() {
        return new BackupHealth(Set.of(BackupProblem.BACKUPS_UNAVAILABLE));
    }

    public static BackupHealth assess(Optional<BackupRun> lastBackup, Optional<BackupRun> lastTestRestore, List<BackupFile> backups, Instant now,
                                      BackupLimits limits) {
        EnumSet<BackupProblem> problems = EnumSet.noneOf(BackupProblem.class);
        if (lastBackup.isEmpty()) {
            problems.add(BackupProblem.BACKUP_MISSING);
        } else if (!lastBackup.get().succeeded()) {
            problems.add(BackupProblem.BACKUP_FAILED);
        } else if (lastBackup.get().finishedAt().isBefore(now.minus(limits.maxBackupAge()))) {
            problems.add(BackupProblem.BACKUP_STALE);
        }
        Instant testDue = now.minus(limits.maxTestRestoreAge());
        if (lastTestRestore.isEmpty()) {
            boolean oldEnough = backups.stream().anyMatch(backup -> backup.createdAt().isBefore(testDue));
            if (oldEnough) {
                problems.add(BackupProblem.TEST_RESTORE_MISSING);
            }
        } else if (!lastTestRestore.get().succeeded()) {
            problems.add(BackupProblem.TEST_RESTORE_FAILED);
        } else if (lastTestRestore.get().finishedAt().isBefore(testDue)) {
            problems.add(BackupProblem.TEST_RESTORE_STALE);
        }
        return new BackupHealth(problems);
    }

    public boolean healthy() {
        return problems.isEmpty();
    }
}
