package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Role;

import java.time.Instant;
import java.util.Set;

public record IssuedTokens(String accessToken, Instant accessTokenExpiresAt, String refreshToken, Instant refreshTokenExpiresAt, Set<Role> roles) {
}
