package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class SecondFactorCodeRejected extends RuleViolation {

    public SecondFactorCodeRejected() {
        super("donors/second-factor-code-rejected", "The code from the authenticator app does not match");
    }
}
