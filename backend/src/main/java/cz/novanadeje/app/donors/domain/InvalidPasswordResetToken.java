package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidPasswordResetToken extends RuleViolation {

    public InvalidPasswordResetToken() {
        super("donors/invalid-password-reset-token", "The password reset link is invalid, expired or already used");
    }
}
