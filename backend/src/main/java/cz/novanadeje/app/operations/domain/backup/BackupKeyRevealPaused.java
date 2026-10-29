package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BackupKeyRevealPaused extends Conflict {

    public static final String CODE = "operations/backup-key-reveal-paused";

    public BackupKeyRevealPaused() {
        super(CODE, "The backup key is not shown for a while after too many refused second factors");
    }
}
