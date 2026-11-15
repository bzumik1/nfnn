package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidTarget extends RuleViolation {

    public InvalidTarget() {
        super("donors/invalid-target", "Tokens are not issued for the resource asked for");
    }
}
