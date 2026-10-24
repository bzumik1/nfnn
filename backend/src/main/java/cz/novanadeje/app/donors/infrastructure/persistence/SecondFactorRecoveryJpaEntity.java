package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_second_factor_recovery")
class SecondFactorRecoveryJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "code_hash", nullable = false, length = 64, unique = true)
    private String codeHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected SecondFactorRecoveryJpaEntity() {
    }

    static SecondFactorRecoveryJpaEntity fromDomain(SecondFactorRecovery recovery) {
        SecondFactorRecoveryJpaEntity entity = new SecondFactorRecoveryJpaEntity();
        entity.id = recovery.id();
        entity.donorId = recovery.donorId().value();
        entity.codeHash = recovery.codeHash();
        entity.createdAt = recovery.createdAt();
        entity.expiresAt = recovery.expiresAt();
        entity.usedAt = recovery.usedAt().orElse(null);
        return entity;
    }

    SecondFactorRecovery toDomain() {
        return SecondFactorRecovery.reconstitute(id, new DonorId(donorId), codeHash, createdAt, expiresAt, usedAt);
    }
}
