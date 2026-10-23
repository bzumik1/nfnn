package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PasskeyConfirmationRejected extends RuleViolation {

    public PasskeyConfirmationRejected() {
        super("donors/passkey-confirmation-rejected", "The passkey does not answer a live challenge as a passkey of this donor");
    }
}
