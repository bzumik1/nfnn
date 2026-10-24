package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class SecondFactorRecovery {

    private final UUID id;
    private final DonorId donorId;
    private final String codeHash;
    private final Instant createdAt;
    private final Instant expiresAt;
    private Instant usedAt;

    private SecondFactorRecovery(UUID id, DonorId donorId, String codeHash, Instant createdAt, Instant expiresAt, Instant usedAt) {
        this.id = id;
        this.donorId = donorId;
        this.codeHash = codeHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
    }

    public static SecondFactorRecovery open(DonorId donorId, SecondFactorRecoveryCode code, Instant at, Duration lifetime) {
        return new SecondFactorRecovery(UuidV7.generate(at), donorId, code.hash(), at, at.plus(lifetime), null);
    }

    public static SecondFactorRecovery reconstitute(UUID id, DonorId donorId, String codeHash, Instant createdAt, Instant expiresAt,
                                                    Instant usedAt) {
        return new SecondFactorRecovery(id, donorId, codeHash, createdAt, expiresAt, usedAt);
    }

    public boolean isOpenAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
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

    public String codeHash() {
        return codeHash;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant expiresAt() {
        return expiresAt;
    }

    public Optional<Instant> usedAt() {
        return Optional.ofNullable(usedAt);
    }
}
