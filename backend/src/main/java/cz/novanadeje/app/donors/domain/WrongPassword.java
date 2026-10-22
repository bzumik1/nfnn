package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class WrongPassword extends RuleViolation {

    public WrongPassword() {
        super("donors/wrong-password", "The current password does not match");
    }
}
