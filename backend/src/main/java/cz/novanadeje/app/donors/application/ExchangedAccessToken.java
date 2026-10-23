package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.OAuthScope;

import java.time.Instant;
import java.util.Set;

public record ExchangedAccessToken(String accessToken, Instant expiresAt, Set<OAuthScope> scopes) {

    public ExchangedAccessToken {
        scopes = Set.copyOf(scopes);
    }
}
