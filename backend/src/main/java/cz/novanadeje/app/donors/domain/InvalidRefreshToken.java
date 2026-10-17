package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidRefreshToken extends AuthenticationFailure {

    public InvalidRefreshToken() {
        super("auth/invalid-refresh-token", "The session can no longer be refreshed");
    }
}
