package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyCeremony;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_passkey_challenge")
public class PasskeyChallengeJpaEntity {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "ceremony", nullable = false, length = 16)
    private PasskeyCeremony ceremony;

    @Column(name = "donor_id")
    private UUID donorId;

    @Column(name = "challenge_hash", nullable = false, length = 64, unique = true)
    private String challengeHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected PasskeyChallengeJpaEntity() {
    }

    static PasskeyChallengeJpaEntity fromDomain(PasskeyChallenge challenge) {
        PasskeyChallengeJpaEntity entity = new PasskeyChallengeJpaEntity();
        entity.id = challenge.id();
        entity.ceremony = challenge.ceremony();
        entity.donorId = challenge.donorId().map(DonorId::value).orElse(null);
        entity.challengeHash = challenge.challengeHash();
        entity.issuedAt = challenge.issuedAt();
        entity.expiresAt = challenge.expiresAt();
        entity.usedAt = challenge.usedAt().orElse(null);
        return entity;
    }

    PasskeyChallenge toDomain() {
        return PasskeyChallenge.reconstitute(id, ceremony, donorId == null ? null : new DonorId(donorId), challengeHash, issuedAt, expiresAt,
                usedAt);
    }
}
