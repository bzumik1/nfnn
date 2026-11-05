package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthenticatedDonor;
import cz.novanadeje.app.donors.domain.SessionKind;

import java.time.Instant;

record AuthResponse(DonorResponse user, String accessToken, Instant accessTokenExpiresAt, SessionKind session) {

    static AuthResponse of(AuthenticatedDonor authenticated) {
        return new AuthResponse(DonorResponse.of(authenticated.donor()), authenticated.tokens().accessToken(), authenticated.tokens().accessTokenExpiresAt(),
                authenticated.tokens().session());
    }

    @Override
    public String toString() {
        return "AuthResponse[user=" + (user == null ? "none" : user.id()) + ", accessToken=***, accessTokenExpiresAt=" + accessTokenExpiresAt + ", session=" + session + "]";
    }
}
