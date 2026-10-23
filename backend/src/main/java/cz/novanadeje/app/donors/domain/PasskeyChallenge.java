package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class PasskeyChallenge {

    private final UUID id;
    private final PasskeyCeremony ceremony;
    private final DonorId donorId;
    private final String challengeHash;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private Instant usedAt;

    private PasskeyChallenge(UUID id, PasskeyCeremony ceremony, DonorId donorId, String challengeHash, Instant issuedAt, Instant expiresAt,
                             Instant usedAt) {
        if (ceremony == PasskeyCeremony.REGISTRATION && donorId == null) {
            throw new IllegalArgumentException("A registration challenge belongs to a donor");
        }
        if (ceremony == PasskeyCeremony.SIGN_IN && donorId != null) {
            throw new IllegalArgumentException("A sign-in challenge belongs to nobody yet");
        }
        this.id = id;
        this.ceremony = ceremony;
        this.donorId = donorId;
        this.challengeHash = challengeHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
    }

    public static PasskeyChallenge forRegistration(LinkSecret challenge, DonorId donorId, Instant issuedAt, Duration lifetime) {
        return new PasskeyChallenge(UuidV7.generate(issuedAt), PasskeyCeremony.REGISTRATION, donorId, challenge.hash(), issuedAt,
                issuedAt.plus(lifetime), null);
    }

    public static PasskeyChallenge forSignIn(LinkSecret challenge, Instant issuedAt, Duration lifetime) {
        return new PasskeyChallenge(UuidV7.generate(issuedAt), PasskeyCeremony.SIGN_IN, null, challenge.hash(), issuedAt,
                issuedAt.plus(lifetime), null);
    }

    public static PasskeyChallenge reconstitute(UUID id, PasskeyCeremony ceremony, DonorId donorId, String challengeHash, Instant issuedAt,
                                                Instant expiresAt, Instant usedAt) {
        return new PasskeyChallenge(id, ceremony, donorId, challengeHash, issuedAt, expiresAt, usedAt);
    }

    public boolean isUsableForRegistrationBy(DonorId donor, Instant now) {
        return ceremony == PasskeyCeremony.REGISTRATION && donorId.equals(donor) && isOpenAt(now);
    }

    public boolean isUsableForSignInAt(Instant now) {
        return ceremony == PasskeyCeremony.SIGN_IN && isOpenAt(now);
    }

    public void markUsed(Instant at) {
        usedAt = at;
    }

    private boolean isOpenAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }

    public UUID id() {
        return id;
    }

    public PasskeyCeremony ceremony() {
        return ceremony;
    }

    public Optional<DonorId> donorId() {
        return Optional.ofNullable(donorId);
    }

    public String challengeHash() {
        return challengeHash;
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
