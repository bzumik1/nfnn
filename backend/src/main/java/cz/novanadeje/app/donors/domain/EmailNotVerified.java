package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class EmailNotVerified extends AuthenticationFailure {

    public EmailNotVerified() {
        super("auth/email-not-verified", "The e-mail address of this account is not verified yet");
    }
}
