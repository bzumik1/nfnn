package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshToken;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
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
        entity.revokedAt = token.revokedAt().orElse(null);
        return entity;
    }

    RefreshToken toDomain() {
        return RefreshToken.reconstitute(id, new DonorId(donorId), secretHash, issuedAt, expiresAt, revokedAt);
    }
}
