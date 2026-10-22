package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.OptionalLong;

public final class SecondFactor {

    private final DonorId donorId;
    private final TotpSecret secret;
    private final Instant createdAt;
    private Instant confirmedAt;
    private Long lastUsedStep;

    private SecondFactor(DonorId donorId, TotpSecret secret, Instant createdAt, Instant confirmedAt, Long lastUsedStep) {
        this.donorId = require(donorId, "Donor id");
        this.secret = require(secret, "Secret");
        this.createdAt = require(createdAt, "Creation time");
        this.confirmedAt = confirmedAt;
        this.lastUsedStep = lastUsedStep;
    }

    public static SecondFactor enrol(DonorId donorId, TotpSecret secret, Instant now) {
        return new SecondFactor(donorId, secret, now, null, null);
    }

    public static SecondFactor reconstitute(DonorId donorId, TotpSecret secret, Instant createdAt, Instant confirmedAt, Long lastUsedStep) {
        return new SecondFactor(donorId, secret, createdAt, confirmedAt, lastUsedStep);
    }

    public void confirm(String code, Instant now) {
        if (isEnabled()) {
            throw new IllegalStateException("The second factor of donor " + donorId + " is already enabled");
        }
        OptionalLong step = Totp.matchingStep(secret, code, now);
        if (step.isEmpty()) {
            throw new SecondFactorCodeRejected();
        }
        confirmedAt = now;
        lastUsedStep = step.getAsLong();
    }

    public void verify(String code, Instant now) {
        if (!isEnabled()) {
            throw new IllegalStateException("The second factor of donor " + donorId + " is not enabled");
        }
        OptionalLong step = Totp.matchingStep(secret, code, now);
        if (step.isEmpty() || step.getAsLong() <= lastUsedStep) {
            throw new InvalidSecondFactorCode();
        }
        lastUsedStep = step.getAsLong();
    }

    public void check(String code, Instant now) {
        try {
            verify(code, now);
        } catch (InvalidSecondFactorCode wrong) {
            throw new SecondFactorCodeRejected();
        }
    }

    public boolean isEnabled() {
        return confirmedAt != null;
    }

    public DonorId donorId() {
        return donorId;
    }

    public TotpSecret secret() {
        return secret;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Optional<Instant> confirmedAt() {
        return Optional.ofNullable(confirmedAt);
    }

    public OptionalLong lastUsedStep() {
        return lastUsedStep == null ? OptionalLong.empty() : OptionalLong.of(lastUsedStep);
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
