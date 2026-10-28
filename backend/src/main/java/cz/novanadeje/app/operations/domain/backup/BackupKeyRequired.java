package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class BackupKeyRequired extends RuleViolation {

    public static final String CODE = "operations/backup-key-required";

    public BackupKeyRequired() {
        super(CODE, "The uploaded backup is encrypted and needs the backup key it was made with");
    }
}
