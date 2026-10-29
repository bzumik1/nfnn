package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BackupKeyConfirmationExpired extends Conflict {

    public static final String CODE = "operations/backup-key-confirmation-expired";

    public BackupKeyConfirmationExpired() {
        super(CODE, "The words of the backup key are confirmed only within half an hour of a reveal and five attempts");
    }
}
