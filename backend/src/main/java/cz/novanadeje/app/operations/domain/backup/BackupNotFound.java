package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class BackupNotFound extends NotFound {

    public static final String CODE = "operations/backup-not-found";

    public BackupNotFound() {
        super(CODE, "There is no such backup");
    }
}
