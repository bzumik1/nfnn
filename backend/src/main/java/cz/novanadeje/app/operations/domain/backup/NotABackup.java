package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class NotABackup extends RuleViolation {

    public static final String CODE = "operations/not-a-backup";

    public NotABackup() {
        super(CODE, "The uploaded file is not a database backup in the custom format of pg_dump");
    }
}
