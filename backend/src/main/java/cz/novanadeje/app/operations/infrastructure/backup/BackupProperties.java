package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupLimits;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("app.operations.backups")
public record BackupProperties(Path directory, Path restoreDirectory, String checkCron, Duration maxBackupAge, Duration maxTestRestoreAge,
                               DataSize maxUploadSize) {

    public BackupProperties {
        Objects.requireNonNull(directory, "app.operations.backups.directory is required");
        Objects.requireNonNull(restoreDirectory, "app.operations.backups.restore-directory is required");
        if (maxUploadSize == null || maxUploadSize.toBytes() <= 0) {
            throw new IllegalArgumentException("app.operations.backups.max-upload-size is a positive size");
        }
        new BackupLimits(maxBackupAge, maxTestRestoreAge);
    }

    BackupLimits limits() {
        return new BackupLimits(maxBackupAge, maxTestRestoreAge);
    }
}
