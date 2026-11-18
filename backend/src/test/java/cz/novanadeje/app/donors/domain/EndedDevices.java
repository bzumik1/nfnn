package cz.novanadeje.app.donors.domain;

import java.time.Instant;

public final class EndedDevices {

    private EndedDevices() {
    }

    public static DonorDevice ended(DonorDevice device, DeviceSignOutReason reason, Instant at) {
        if (!device.isActive() || at.isBefore(device.lastUsedAt())) {
            throw new IllegalArgumentException("Only an active device ends, and not before its last use");
        }
        return DonorDevice.reconstitute(device.id(), device.donorId(), device.description(), device.kind(), device.signedInAt(),
                device.lastUsedAt(), at, reason, device.statusSecretHash().orElse(null), reason.wipe().orElse(null));
    }
}
