package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class RefreshToken {

    private final UUID id;
    private final DonorId donorId;
    private final String secretHash;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private final boolean secondFactorVerified;
    private Instant revokedAt;

    private RefreshToken(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt, boolean secondFactorVerified,
                         Instant revokedAt) {
        this.id = id;
        this.donorId = donorId;
        this.secretHash = secretHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.secondFactorVerified = secondFactorVerified;
        this.revokedAt = revokedAt;
    }

    public static RefreshToken issue(RefreshTokenSecret secret, DonorId donorId, Instant issuedAt, Duration lifetime, boolean secondFactorVerified) {
        return new RefreshToken(UuidV7.generate(issuedAt), donorId, secret.hash(), issuedAt, issuedAt.plus(lifetime), secondFactorVerified, null);
    }

    public static RefreshToken reconstitute(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt,
                                            boolean secondFactorVerified, Instant revokedAt) {
        return new RefreshToken(id, donorId, secretHash, issuedAt, expiresAt, secondFactorVerified, revokedAt);
    }

    public boolean secondFactorVerified() {
        return secondFactorVerified;
    }

    public boolean isUsableAt(Instant now) {
        return revokedAt == null && now.isBefore(expiresAt);
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public void revoke(Instant at) {
        if (revokedAt == null) {
            revokedAt = at;
        }
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

    public Optional<Instant> revokedAt() {
        return Optional.ofNullable(revokedAt);
    }
}
