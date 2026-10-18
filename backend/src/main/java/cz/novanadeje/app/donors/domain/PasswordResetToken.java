package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class PasswordResetToken {

    private final UUID id;
    private final DonorId donorId;
    private final String secretHash;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private Instant usedAt;

    private PasswordResetToken(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt, Instant usedAt) {
        this.id = id;
        this.donorId = donorId;
        this.secretHash = secretHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
    }

    public static PasswordResetToken issue(PasswordResetSecret secret, DonorId donorId, Instant issuedAt, Duration lifetime) {
        return new PasswordResetToken(UuidV7.generate(issuedAt), donorId, secret.hash(), issuedAt, issuedAt.plus(lifetime), null);
    }

    public static PasswordResetToken reconstitute(UUID id, DonorId donorId, String secretHash, Instant issuedAt, Instant expiresAt, Instant usedAt) {
        return new PasswordResetToken(id, donorId, secretHash, issuedAt, expiresAt, usedAt);
    }

    public boolean isUsableAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }

    public void markUsed(Instant at) {
        if (usedAt != null) {
            throw new IllegalStateException("Password reset token " + id + " is already used");
        }
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

    public Optional<Instant> usedAt() {
        return Optional.ofNullable(usedAt);
    }
}
