package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record BackupAlertId(UUID value) {

    public BackupAlertId {
        if (value == null) {
            throw new IllegalArgumentException("Backup alert id is required");
        }
    }

    public static BackupAlertId newId(Instant at) {
        return new BackupAlertId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
