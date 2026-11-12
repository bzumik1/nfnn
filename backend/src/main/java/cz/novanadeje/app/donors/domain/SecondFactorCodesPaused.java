package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SecondFactorCodesPaused extends Conflict {

    public static final String CODE = "donors/second-factor-codes-paused";

    public SecondFactorCodesPaused() {
        super(CODE, "No code from the authenticator app is checked for a while after too many wrong codes");
    }
}
