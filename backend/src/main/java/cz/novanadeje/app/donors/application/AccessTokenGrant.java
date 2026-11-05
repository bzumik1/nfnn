package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

public record AccessTokenGrant(DonorId donorId, Set<Role> roles, String audience, Set<OAuthScope> scopes, Instant issuedAt, Instant notAfter,
                               String client, DeviceId device) {

    public AccessTokenGrant(DonorId donorId, Set<Role> roles, String audience, Set<OAuthScope> scopes, Instant issuedAt, Instant notAfter,
                            String client) {
        this(donorId, roles, audience, scopes, issuedAt, notAfter, client, null);
    }

    public Optional<Instant> latestExpiry() {
        return Optional.ofNullable(notAfter);
    }

    public Optional<String> connectedClient() {
        return Optional.ofNullable(client);
    }

    public Optional<DeviceId> session() {
        return Optional.ofNullable(device);
    }
}
