package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.OAuthScope;

import java.time.Instant;
import java.util.Set;

public record OAuthTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Set<OAuthScope> scopes) {
}
