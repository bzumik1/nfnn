package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupLimits;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("app.operations.backups")
public record BackupProperties(Path directory, Path restoreDirectory, String checkCron, Duration maxBackupAge, Duration maxTestRestoreAge) {

    public BackupProperties {
        Objects.requireNonNull(directory, "app.operations.backups.directory is required");
        Objects.requireNonNull(restoreDirectory, "app.operations.backups.restore-directory is required");
        new BackupLimits(maxBackupAge, maxTestRestoreAge);
    }

    BackupLimits limits() {
        return new BackupLimits(maxBackupAge, maxTestRestoreAge);
    }
}
