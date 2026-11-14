package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.application.SignedInDeviceCheck;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.application.session.SignedInDevice;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
class LockedSignedInDevices implements SignedInDevices {

    private final SignedInDeviceCheck check;

    LockedSignedInDevices(SignedInDeviceCheck check) {
        this.check = check;
    }

    @Override
    public Optional<SignedInDevice> holdSignedIn(UUID donorId, UUID deviceId) {
        return check.hold(new DonorId(donorId), new DeviceId(deviceId)).map(device -> new SignedInDevice(device.kind().keepsNothing()));
    }

    @Override
    public Set<UUID> signedInAmong(Collection<UUID> deviceIds) {
        return check.signedInAmong(deviceIds.stream().map(DeviceId::new).toList()).stream().map(DeviceId::value)
                .collect(Collectors.toUnmodifiableSet());
    }
}
