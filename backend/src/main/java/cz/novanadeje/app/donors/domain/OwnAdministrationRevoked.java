package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class OwnAdministrationRevoked extends RuleViolation {

    public OwnAdministrationRevoked() {
        super("donors/own-administration", "An administrator cannot take the role away from themselves");
    }
}
