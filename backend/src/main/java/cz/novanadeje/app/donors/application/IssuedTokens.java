package cz.novanadeje.app.donors.application;

import java.time.Instant;

public record IssuedTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Instant refreshTokenExpiresAt) {
}
