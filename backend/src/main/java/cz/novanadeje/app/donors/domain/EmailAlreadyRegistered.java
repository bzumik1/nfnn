package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class EmailAlreadyRegistered extends Conflict {

    public EmailAlreadyRegistered() {
        super("donors/email-already-registered", "An account with this email already exists");
    }
}
