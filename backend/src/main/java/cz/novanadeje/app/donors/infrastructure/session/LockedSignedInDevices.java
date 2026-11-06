package cz.novanadeje.app.donors.infrastructure.session;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SessionEnded;
import cz.novanadeje.app.shared.application.session.SignedInDevices;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
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
    public void holdSignedIn(UUID donorId, UUID deviceId) {
        DonorId donor = new DonorId(donorId);
        DeviceId device = new DeviceId(deviceId);
        refreshTokens.lockSessionsOf(donor);
        boolean signedIn = devices.findById(device).filter(found -> found.belongsTo(donor)).isPresent() && devices.isSignedIn(device, clock.instant());
        if (!signedIn) {
            throw new SessionEnded();
        }
    }
}
