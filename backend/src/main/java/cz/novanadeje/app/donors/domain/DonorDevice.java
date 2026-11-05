package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;

public final class DonorDevice {

    private final DeviceId id;
    private final DonorId donorId;
    private final DeviceDescription description;
    private final Instant signedInAt;
    private Instant lastUsedAt;
    private Instant endedAt;
    private DeviceSignOutReason endReason;

    private DonorDevice(DeviceId id, DonorId donorId, DeviceDescription description, Instant signedInAt, Instant lastUsedAt,
                        Instant endedAt, DeviceSignOutReason endReason) {
        if (id == null || donorId == null || description == null || signedInAt == null || lastUsedAt == null) {
            throw new IllegalArgumentException("A device needs its id, donor, description and times");
        }
        if ((endedAt == null) != (endReason == null)) {
            throw new IllegalArgumentException("A device ends with both a time and a reason");
        }
        this.id = id;
        this.donorId = donorId;
        this.description = description;
        this.signedInAt = signedInAt;
        this.lastUsedAt = lastUsedAt;
        this.endedAt = endedAt;
        this.endReason = endReason;
    }

    public static DonorDevice signIn(DonorId donorId, DeviceDescription description, Instant at) {
        return new DonorDevice(DeviceId.newId(at), donorId, description, at, at, null, null);
    }

    public static DonorDevice reconstitute(DeviceId id, DonorId donorId, DeviceDescription description, Instant signedInAt,
                                           Instant lastUsedAt, Instant endedAt, DeviceSignOutReason endReason) {
        return new DonorDevice(id, donorId, description, signedInAt, lastUsedAt, endedAt, endReason);
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
}
