package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class EmailNotRegistered extends NotFound {

    public EmailNotRegistered() {
        super("donors/email-not-registered", "No donor is registered with that e-mail address");
    }
}
