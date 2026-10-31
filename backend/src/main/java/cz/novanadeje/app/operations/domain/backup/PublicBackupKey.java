package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PublicBackupKey extends RuleViolation {

    public static final String CODE = "operations/public-backup-key";

    public PublicBackupKey() {
        super(CODE, "The backup key is the public key of the development profile, which outside development never becomes the server's backup key");
    }
}
