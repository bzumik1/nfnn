package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BackupsUnavailable extends Conflict {

    public static final String CODE = "operations/backups-unavailable";

    public BackupsUnavailable() {
        super(CODE, "The backup folder is not connected or the backup container is not running");
    }
}
