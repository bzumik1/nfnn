package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class BackupKeyCheckMismatch extends RuleViolation {

    public static final String CODE = "operations/backup-key-check-mismatch";

    public BackupKeyCheckMismatch() {
        super(CODE, "The words typed are not the words of the backup key at the asked positions");
    }
}
