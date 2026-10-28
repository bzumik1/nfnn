package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidBackupKey extends RuleViolation {

    public static final String CODE = "operations/invalid-backup-key";

    public InvalidBackupKey() {
        super(CODE, "The backup key is not an age key: it starts with AGE-SECRET-KEY-1 and its last characters check the rest");
    }
}
