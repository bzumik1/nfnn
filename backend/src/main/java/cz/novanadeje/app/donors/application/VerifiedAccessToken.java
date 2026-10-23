package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

public record VerifiedAccessToken(DonorId donorId, Set<Role> roles, Set<String> audiences, Set<OAuthScope> scopes, Instant expiresAt,
                                  String client) {

    public Optional<String> connectedClient() {
        return Optional.ofNullable(client);
    }
}
