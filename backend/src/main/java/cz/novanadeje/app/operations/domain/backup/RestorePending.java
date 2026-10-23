package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class RestorePending extends Conflict {

    public static final String CODE = "operations/restore-pending";

    public RestorePending() {
        super(CODE, "A restore is already waiting for the backup container or running");
    }
}
