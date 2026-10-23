package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class PasskeyNotFound extends NotFound {

    public PasskeyNotFound(PasskeyId id) {
        super("donors/passkey-not-found", "Passkey " + id + " does not exist");
    }
}
