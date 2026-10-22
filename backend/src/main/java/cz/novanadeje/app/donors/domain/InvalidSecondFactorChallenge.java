package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class InvalidSecondFactorChallenge extends AuthenticationFailure {

    public InvalidSecondFactorChallenge() {
        super("auth/invalid-second-factor-challenge", "The sign-in expired, was completed already or failed too often; sign in again");
    }
}
