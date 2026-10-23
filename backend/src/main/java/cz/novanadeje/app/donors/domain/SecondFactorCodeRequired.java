package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class SecondFactorCodeRequired extends RuleViolation {

    public SecondFactorCodeRequired() {
        super("donors/second-factor-code-required", "The recovery needs the code from the authenticator app");
    }
}
