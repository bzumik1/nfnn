package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;

public final class DonorDevice {

    private final DeviceId id;
    private final DonorId donorId;
    private final DeviceDescription description;
    private final SessionKind kind;
    private final Instant signedInAt;
    private Instant lastUsedAt;
    private Instant endedAt;
    private DeviceSignOutReason endReason;
    private final String statusSecretHash;
    private final DeviceWipe wipe;

    private DonorDevice(DeviceId id, DonorId donorId, DeviceDescription description, SessionKind kind, Instant signedInAt, Instant lastUsedAt,
                        Instant endedAt, DeviceSignOutReason endReason, String statusSecretHash, DeviceWipe wipe) {
        if (id == null || donorId == null || description == null || kind == null || signedInAt == null || lastUsedAt == null) {
            throw new IllegalArgumentException("A device needs its id, donor, description, session kind and times");
        }
        if ((endedAt == null) != (endReason == null)) {
            throw new IllegalArgumentException("A device ends with both a time and a reason");
        }
        this.id = id;
        this.donorId = donorId;
        this.description = description;
        this.kind = kind;
        this.signedInAt = signedInAt;
        this.lastUsedAt = lastUsedAt;
        this.endedAt = endedAt;
        this.endReason = endReason;
        this.statusSecretHash = statusSecretHash;
        this.wipe = wipe;
    }

    public static DonorDevice signIn(DonorId donorId, DeviceDescription description, SessionKind kind, Instant at) {
        return new DonorDevice(DeviceId.newId(at), donorId, description, kind, at, at, null, null, null, null);
    }

    public static DonorDevice signIn(DonorId donorId, DeviceDescription description, SessionKind kind, Instant at, DeviceStatusSecret statusSecret) {
        return new DonorDevice(DeviceId.newId(at), donorId, description, kind, at, at, null, null, statusSecret.hash(), null);
    }

    public static DonorDevice reconstitute(DeviceId id, DonorId donorId, DeviceDescription description, SessionKind kind, Instant signedInAt,
                                           Instant lastUsedAt, Instant endedAt, DeviceSignOutReason endReason) {
        return new DonorDevice(id, donorId, description, kind, signedInAt, lastUsedAt, endedAt, endReason, null, null);
    }

    public static DonorDevice reconstitute(DeviceId id, DonorId donorId, DeviceDescription description, SessionKind kind, Instant signedInAt,
                                           Instant lastUsedAt, Instant endedAt, DeviceSignOutReason endReason, Optional<String> statusSecretHash,
                                           Optional<DeviceWipe> wipe) {
        return new DonorDevice(id, donorId, description, kind, signedInAt, lastUsedAt, endedAt, endReason, statusSecretHash.orElse(null),
                wipe.orElse(null));
    }

    public DeviceStatus status() {
        if (wipe != null) {
            return wipe == DeviceWipe.ALL ? DeviceStatus.WIPE_ALL : DeviceStatus.WIPE_ADMINISTRATION;
        }
        return isActive() ? DeviceStatus.SIGNED_IN : DeviceStatus.SIGNED_OUT;
    }

    public boolean isActive() {
        return endedAt == null;
    }

    public boolean belongsTo(DonorId donor) {
        return donorId.equals(donor);
    }

    public void recordUse(Instant at) {
        if (isActive() && at.isAfter(lastUsedAt)) {
            lastUsedAt = at;
        }
    }

    public boolean end(DeviceSignOutReason reason, Instant at) {
        if (reason == null || at == null) {
            throw new IllegalArgumentException("A device ends with a reason and a time");
        }
        if (!isActive()) {
            return false;
        }
        endedAt = at;
        endReason = reason;
        return true;
    }

    public DeviceId id() {
        return id;
    }

    public DonorId donorId() {
        return donorId;
    }

    public DeviceDescription description() {
        return description;
    }

    public SessionKind kind() {
        return kind;
    }

    public Instant signedInAt() {
        return signedInAt;
    }

    public Instant lastUsedAt() {
        return lastUsedAt;
    }

    public Optional<Instant> endedAt() {
        return Optional.ofNullable(endedAt);
    }

    public Optional<DeviceSignOutReason> endReason() {
        return Optional.ofNullable(endReason);
    }

    public Optional<String> statusSecretHash() {
        return Optional.ofNullable(statusSecretHash);
    }

    public Optional<DeviceWipe> wipe() {
        return Optional.ofNullable(wipe);
    }
}
