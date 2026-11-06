package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BackupRequestPending extends Conflict {

    public static final String CODE = "operations/backup-request-pending";

    public BackupRequestPending() {
        super(CODE, "A backup, test restore or restore request is already waiting for the backup container");
    }
}
