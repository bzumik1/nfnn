package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidAuthorizationRequest extends RuleViolation {

    public InvalidAuthorizationRequest(String reason) {
        super("donors/invalid-authorization-request", "The authorization request is refused: " + reason);
    }
}
