package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class FreshSecondFactorRequired extends RuleViolation {

    public FreshSecondFactorRequired() {
        super("donors/fresh-second-factor-required", "The approval needs a fresh code from the authenticator app or a passkey");
    }
}
