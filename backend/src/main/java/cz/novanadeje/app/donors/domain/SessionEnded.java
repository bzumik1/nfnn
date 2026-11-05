package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class SessionEnded extends AuthenticationFailure {

    public SessionEnded() {
        super("auth/session-ended", "The session of this device has ended");
    }
}
