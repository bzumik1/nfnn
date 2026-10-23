package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class BackupTooLarge extends RuleViolation {

    public static final String CODE = "operations/backup-too-large";

    public BackupTooLarge() {
        super(CODE, "The uploaded backup is larger than the server takes");
    }
}
