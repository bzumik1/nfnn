package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidGrant extends AuthenticationFailure {

    public InvalidGrant(String reason) {
        super("donors/invalid-grant", "The grant is refused: " + reason);
    }
}
