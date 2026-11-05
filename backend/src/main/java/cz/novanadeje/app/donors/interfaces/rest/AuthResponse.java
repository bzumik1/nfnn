package cz.novanadeje.app.donors.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonInclude;
import cz.novanadeje.app.donors.application.AuthenticatedDonor;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.SessionKind;

import java.time.Instant;

record AuthResponse(DonorResponse user, String accessToken, Instant accessTokenExpiresAt, SessionKind session,
                    @JsonInclude(JsonInclude.Include.NON_NULL) String deviceSecret) {

    static AuthResponse of(AuthenticatedDonor authenticated) {
        return new AuthResponse(DonorResponse.of(authenticated.donor()), authenticated.tokens().accessToken(), authenticated.tokens().accessTokenExpiresAt(),
                authenticated.tokens().session(), authenticated.tokens().deviceSecret().map(DeviceStatusSecret::value).orElse(null));
    }

    @Override
    public String toString() {
        return "AuthResponse[user=" + (user == null ? "none" : user.id()) + ", accessToken=***, accessTokenExpiresAt=" + accessTokenExpiresAt + ", session=" + session
                + ", deviceSecret=" + (deviceSecret == null ? "none" : "***") + "]";
    }
}
