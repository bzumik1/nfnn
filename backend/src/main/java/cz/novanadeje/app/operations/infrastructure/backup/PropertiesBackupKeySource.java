package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.InvalidBackupKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class PropertiesBackupKeySource implements BackupKeySource {

    private static final Logger log = LoggerFactory.getLogger(PropertiesBackupKeySource.class);

    private final Optional<BackupKey> key;

    PropertiesBackupKeySource(BackupKeyProperties properties) {
        this.key = parse(properties.value());
    }

    @Override
    public Optional<BackupKey> current() {
        return key;
    }

    private static Optional<BackupKey> parse(String value) {
        if (value == null) {
            log.warn("The backend has no backup key (BACKUP_KEY from secrets/backup-key); it cannot be shown or confirmed in the administration");
            return Optional.empty();
        }
        try {
            return Optional.of(new BackupKey(value));
        } catch (InvalidBackupKey invalid) {
            log.error("The backup key handed to the backend is not a valid age key; it cannot be shown or confirmed in the administration");
            return Optional.empty();
        }
    }
}
