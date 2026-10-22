package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class EmailUnchanged extends RuleViolation {

    public EmailUnchanged() {
        super("donors/email-unchanged", "The new e-mail address is the one the account already has");
    }
}
