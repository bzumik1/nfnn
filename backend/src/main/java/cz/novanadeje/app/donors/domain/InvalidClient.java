package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidClient extends RuleViolation {

    public InvalidClient(String reason) {
        super("donors/invalid-client", "The OAuth client is refused: " + reason);
    }
}
