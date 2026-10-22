package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidSecondFactorCode extends AuthenticationFailure {

    public InvalidSecondFactorCode() {
        super("auth/invalid-second-factor-code", "The code from the authenticator app is wrong or was used already");
    }
}
