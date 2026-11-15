package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record AccessTokenGrant(DonorId donorId, Set<Role> roles, String audience, Set<OAuthScope> scopes, Instant issuedAt,
                               Optional<Instant> latestExpiry, Optional<String> connectedClient, Optional<DeviceId> session) {

    public AccessTokenGrant {
        Objects.requireNonNull(donorId, "donorId");
        Objects.requireNonNull(roles, "roles");
        Objects.requireNonNull(audience, "audience");
        Objects.requireNonNull(scopes, "scopes");
        Objects.requireNonNull(issuedAt, "issuedAt");
        Objects.requireNonNull(latestExpiry, "latestExpiry");
        Objects.requireNonNull(connectedClient, "connectedClient");
        Objects.requireNonNull(session, "session");
        if (connectedClient.isPresent() == scopes.isEmpty()) {
            throw new IllegalStateException("A connected application's token carries scopes and no other token does");
        }
        if (session.isPresent() && connectedClient.isPresent()) {
            throw new IllegalStateException("A token is either a browser session's or a connected application's");
        }
        if (latestExpiry.isPresent() && connectedClient.isEmpty()) {
            throw new IllegalStateException("Only a connected application's exchanged token is capped by a latest expiry");
        }
    }
}
