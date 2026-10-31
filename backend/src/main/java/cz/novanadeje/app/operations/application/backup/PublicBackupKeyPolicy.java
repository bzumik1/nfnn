package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;

public interface PublicBackupKeyPolicy {

    boolean refuses(BackupKey key);
}
