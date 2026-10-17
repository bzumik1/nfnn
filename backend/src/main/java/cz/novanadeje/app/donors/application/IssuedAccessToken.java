package cz.novanadeje.app.donors.application;

import java.time.Instant;

public record IssuedAccessToken(String token, Instant expiresAt) {
}
