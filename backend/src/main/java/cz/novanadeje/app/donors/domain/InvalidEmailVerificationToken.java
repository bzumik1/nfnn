package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidEmailVerificationToken extends RuleViolation {

    public InvalidEmailVerificationToken() {
        super("donors/invalid-email-verification-token", "The e-mail verification link is invalid, expired or already used");
    }
}
