package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class NoPasskeys extends RuleViolation {

    public NoPasskeys() {
        super("donors/no-passkeys", "The donor has no passkey");
    }
}
