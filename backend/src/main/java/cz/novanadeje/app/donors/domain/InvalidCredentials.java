package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidCredentials extends AuthenticationFailure {

    public InvalidCredentials() {
        super("auth/invalid-credentials", "Email or password is wrong");
    }
}
