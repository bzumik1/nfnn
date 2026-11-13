package cz.novanadeje.app.shared.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public final class ExpiredAccessToken extends AuthenticationFailure {

    public ExpiredAccessToken() {
        super("auth/expired-token", "The session of this access token ended");
    }
}
