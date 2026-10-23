package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidTarget extends RuleViolation {

    public InvalidTarget(String resource) {
        super("donors/invalid-target", "Tokens are not issued for the resource '" + resource + "'");
    }
}
