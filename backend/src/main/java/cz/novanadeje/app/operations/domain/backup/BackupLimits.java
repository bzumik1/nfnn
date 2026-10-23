package cz.novanadeje.app.operations.domain.backup;

import java.time.Duration;

public record BackupLimits(Duration maxBackupAge, Duration maxTestRestoreAge) {

    public BackupLimits {
        requirePositive(maxBackupAge, "maxBackupAge");
        requirePositive(maxTestRestoreAge, "maxTestRestoreAge");
    }

    private static void requirePositive(Duration duration, String name) {
        if (duration == null || duration.isNegative() || duration.isZero()) {
            throw new IllegalArgumentException("The backup limit " + name + " must be positive, but is " + duration);
        }
    }
}
