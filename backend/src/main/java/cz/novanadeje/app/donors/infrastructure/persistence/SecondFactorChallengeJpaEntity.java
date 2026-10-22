package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_second_factor_challenge")
public class SecondFactorChallengeJpaEntity {

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

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "used_at")
    private Instant usedAt;

    protected SecondFactorChallengeJpaEntity() {
    }

    static SecondFactorChallengeJpaEntity fromDomain(SecondFactorChallenge challenge) {
        SecondFactorChallengeJpaEntity entity = new SecondFactorChallengeJpaEntity();
        entity.id = challenge.id();
        entity.donorId = challenge.donorId().value();
        entity.secretHash = challenge.secretHash();
        entity.issuedAt = challenge.issuedAt();
        entity.expiresAt = challenge.expiresAt();
        entity.failedAttempts = challenge.failedAttempts();
        entity.usedAt = challenge.usedAt().orElse(null);
        return entity;
    }

    SecondFactorChallenge toDomain() {
        return SecondFactorChallenge.reconstitute(id, new DonorId(donorId), secretHash, issuedAt, expiresAt, failedAttempts, usedAt);
    }
}
