package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.OAuthScope;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record ConnectedAppView(UUID id, String client, Set<OAuthScope> scopes, Instant grantedAt, Instant lastUsedAt, Instant expiresAt) {
}
