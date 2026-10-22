package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthenticatedDonor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.Instant;

final class SessionResponses {

    private SessionResponses() {
    }

    static ResponseEntity<AuthResponse> opened(HttpStatus status, AuthenticatedDonor authenticated, Instant now) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, RefreshTokenCookie.carrying(
                        authenticated.tokens().refreshToken(), authenticated.tokens().refreshTokenExpiresAt(), now).toString())
                .body(AuthResponse.of(authenticated));
    }
}
