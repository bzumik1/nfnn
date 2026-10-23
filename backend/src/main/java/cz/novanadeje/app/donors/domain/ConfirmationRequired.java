package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ConfirmationRequired extends RuleViolation {

    public ConfirmationRequired() {
        super("donors/confirmation-required", "The change needs the password or a passkey");
    }
}
