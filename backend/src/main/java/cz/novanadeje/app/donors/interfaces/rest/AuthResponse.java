package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthenticatedDonor;

import java.time.Instant;

record AuthResponse(DonorResponse user, String accessToken, Instant accessTokenExpiresAt) {

    static AuthResponse of(AuthenticatedDonor authenticated) {
        return new AuthResponse(DonorResponse.of(authenticated.donor()), authenticated.tokens().accessToken(), authenticated.tokens().accessTokenExpiresAt());
    }
}
