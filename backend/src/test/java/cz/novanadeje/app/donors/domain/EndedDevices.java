package cz.novanadeje.app.donors.domain;

import java.time.Instant;

public final class EndedDevices {

    private EndedDevices() {
    }

    public static DonorDevice ended(DonorDevice device, DeviceSignOutReason reason, Instant at) {
        return DonorDevice.reconstitute(device.id(), device.donorId(), device.description(), device.kind(), device.signedInAt(),
                device.lastUsedAt(), at, reason, device.statusSecretHash().orElse(null), reason.wipe().orElse(null));
    }
}
