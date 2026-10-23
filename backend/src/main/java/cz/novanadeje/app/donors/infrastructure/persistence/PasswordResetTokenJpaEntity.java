package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_password_reset_token")
class PasswordResetTokenJpaEntity {

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

    @Column(name = "used_at")
    private Instant usedAt;

    protected PasswordResetTokenJpaEntity() {
    }

    static PasswordResetTokenJpaEntity fromDomain(PasswordResetToken token) {
        PasswordResetTokenJpaEntity entity = new PasswordResetTokenJpaEntity();
        entity.id = token.id();
        entity.donorId = token.donorId().value();
        entity.secretHash = token.secretHash();
        entity.issuedAt = token.issuedAt();
        entity.expiresAt = token.expiresAt();
        entity.usedAt = token.usedAt().orElse(null);
        return entity;
    }

    PasswordResetToken toDomain() {
        return PasswordResetToken.reconstitute(id, new DonorId(donorId), secretHash, issuedAt, expiresAt, usedAt);
    }
}
