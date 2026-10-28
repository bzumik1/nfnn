package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BackupKeyUnavailable extends Conflict {

    public static final String CODE = "operations/backup-key-unavailable";

    public BackupKeyUnavailable() {
        super(CODE, "The backend has no backup key: the secrets folder is not mounted or its backup-key file is missing");
    }
}
