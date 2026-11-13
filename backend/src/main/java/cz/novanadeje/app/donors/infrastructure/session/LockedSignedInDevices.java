package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SessionEnded;
import cz.novanadeje.app.shared.application.session.SignedInDevice;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

@Component
class LockedSignedInDevices implements SignedInDevices {

    private final RefreshTokenRepository refreshTokens;
    private final DonorDeviceRepository devices;
    private final Clock clock;

    LockedSignedInDevices(RefreshTokenRepository refreshTokens, DonorDeviceRepository devices, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.devices = devices;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public SignedInDevice holdSignedIn(UUID donorId, UUID deviceId) {
        DonorId donor = new DonorId(donorId);
        DeviceId device = new DeviceId(deviceId);
        refreshTokens.lockSessionsOf(donor);
        Optional<DonorDevice> found = devices.findById(device).filter(candidate -> candidate.belongsTo(donor));
        if (found.isEmpty() || !devices.isSignedIn(device, clock.instant())) {
            throw new SessionEnded();
        }
        return new SignedInDevice(found.get().kind().keepsNothing());
    }
}
