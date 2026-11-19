package cz.novanadeje.app.donors.domain;

import java.time.Instant;

public final class EndedDevices {

    private EndedDevices() {
    }

    public static DonorDevice ended(DonorDevice device, DeviceSignOutReason reason, Instant at) {
        if (!device.isActive() || at.isBefore(device.lastUsedAt())) {
            throw new IllegalArgumentException("Only an active device ends, and not before its last use");
        }
        if (reason == DeviceSignOutReason.ADMINISTRATION_CHANGED || reason == DeviceSignOutReason.ERASED) {
            throw new IllegalArgumentException("A role removal or an erasure ends every device of the donor with its own order, not one device");
        }
        return DonorDevice.reconstitute(device.id(), device.donorId(), device.description(), device.kind(), device.signedInAt(),
                device.lastUsedAt(), at, reason, device.statusSecretHash().orElse(null), reason.wipe().orElse(null));
    }
}
