package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class SecondFactorChallenge {

    private final UUID id;
    private final DonorId donorId;
    private final String secretHash;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private int failedAttempts;
    private Instant usedAt;

    private SecondFactorChallenge(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt, int failedAttempts,
                                  Instant usedAt) {
        this.id = id;
        this.donorId = donorId;
        this.secretHash = secretHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.failedAttempts = failedAttempts;
        this.usedAt = usedAt;
    }

    public static SecondFactorChallenge issue(LinkSecret secret, DonorId donorId, Instant issuedAt, Duration lifetime) {
        return new SecondFactorChallenge(UuidV7.generate(issuedAt), donorId, secret.hash(), issuedAt, issuedAt.plus(lifetime), 0, null);
    }

    public static SecondFactorChallenge reconstitute(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt,
                                                     int failedAttempts, Instant usedAt) {
        return new SecondFactorChallenge(id, donorId, secretHash, issuedAt, expiresAt, failedAttempts, usedAt);
    }

    public boolean isUsableAt(Instant now, int maxFailedAttempts) {
        return usedAt == null && now.isBefore(expiresAt) && failedAttempts < maxFailedAttempts;
    }

    public void recordFailedAttempt() {
        failedAttempts++;
    }

    public void markUsed(Instant at) {
        usedAt = at;
    }

    public UUID id() {
        return id;
    }

    public DonorId donorId() {
        return donorId;
    }

    public String secretHash() {
        return secretHash;
    }

    public Instant issuedAt() {
        return issuedAt;
    }

    public Instant expiresAt() {
        return expiresAt;
    }

    public int failedAttempts() {
        return failedAttempts;
    }

    public Optional<Instant> usedAt() {
        return Optional.ofNullable(usedAt);
    }
}
