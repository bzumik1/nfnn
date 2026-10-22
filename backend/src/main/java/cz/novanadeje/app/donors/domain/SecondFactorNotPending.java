package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class SecondFactorNotPending extends RuleViolation {

    public SecondFactorNotPending() {
        super("donors/second-factor-not-pending", "No second factor is being set up; start with the setup");
    }
}
