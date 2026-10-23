package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PasskeyRejected extends RuleViolation {

    public PasskeyRejected() {
        super("donors/passkey-rejected", "The new passkey does not answer a live challenge of this donor for this site with user verification");
    }
}
