package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidPasskey extends AuthenticationFailure {

    public InvalidPasskey() {
        super("auth/invalid-passkey", "The passkey is unknown, its sign-in expired or its signature does not match");
    }
}
