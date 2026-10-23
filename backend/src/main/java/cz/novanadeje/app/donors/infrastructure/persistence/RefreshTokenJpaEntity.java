package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.RefreshToken;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "donor_refresh_token")
public class RefreshTokenJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "secret_hash", nullable = false, length = 64, unique = true)
    private String secretHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "second_factor_verified", nullable = false)
    private boolean secondFactorVerified;

    @Column(name = "client_id", length = 512)
    private String clientId;

    @Column(name = "scope", length = 200)
    private String scope;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected RefreshTokenJpaEntity() {
    }

    static RefreshTokenJpaEntity fromDomain(RefreshToken token) {
        RefreshTokenJpaEntity entity = new RefreshTokenJpaEntity();
        entity.id = token.id();
        entity.donorId = token.donorId().value();
        entity.secretHash = token.secretHash();
        entity.issuedAt = token.issuedAt();
        entity.expiresAt = token.expiresAt();
        entity.secondFactorVerified = token.secondFactorVerified();
        entity.clientId = token.clientId().map(ClientId::value).orElse(null);
        entity.scope = token.scopes().isEmpty() ? null : OAuthScope.format(token.scopes());
        entity.grantedAt = token.grantedAt();
        entity.usedAt = token.usedAt().orElse(null);
        entity.revokedAt = token.revokedAt().orElse(null);
        return entity;
    }

    RefreshToken toDomain() {
        Set<OAuthScope> scopes = scope == null ? Set.of() : OAuthScope.parse(scope);
        return RefreshToken.reconstitute(id, new DonorId(donorId), secretHash, issuedAt, expiresAt, secondFactorVerified,
                clientId == null ? null : new ClientId(clientId), scopes, grantedAt, usedAt, revokedAt);
    }
}
