package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class BackupKeyCheckMismatch extends RuleViolation {

    public static final String CODE = "operations/backup-key-check-mismatch";

    public BackupKeyCheckMismatch() {
        super(CODE, "The characters typed are not the last four characters of the backup key");
    }
}
