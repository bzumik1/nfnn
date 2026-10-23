package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthenticatedDonor;

import java.time.Instant;

record AuthResponse(DonorResponse user, String accessToken, Instant accessTokenExpiresAt) {

    static AuthResponse of(AuthenticatedDonor authenticated) {
        return new AuthResponse(DonorResponse.of(authenticated.donor()), authenticated.tokens().accessToken(), authenticated.tokens().accessTokenExpiresAt());
    }

    @Override
    public String toString() {
        return "AuthResponse[user=" + (user == null ? "none" : user.id()) + ", accessToken=***, accessTokenExpiresAt=" + accessTokenExpiresAt + "]";
    }
}
