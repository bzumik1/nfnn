package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class SecondFactorNotEnabled extends RuleViolation {

    public SecondFactorNotEnabled() {
        super("donors/second-factor-not-enabled", "The second factor is not enabled");
    }
}
