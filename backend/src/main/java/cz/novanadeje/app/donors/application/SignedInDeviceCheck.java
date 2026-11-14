package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Collection;
import java.util.Optional;
import java.util.Set;

@Service
public class SignedInDeviceCheck {

    private final RefreshTokenRepository refreshTokens;
    private final DonorDeviceRepository devices;
    private final Clock clock;

    public SignedInDeviceCheck(RefreshTokenRepository refreshTokens, DonorDeviceRepository devices, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.devices = devices;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public boolean isSignedIn(DeviceId device) {
        return devices.isSignedIn(device, clock.instant());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<DonorDevice> hold(DonorId donorId, DeviceId deviceId) {
        refreshTokens.lockSessionsOf(donorId);
        return devices.findById(deviceId)
                .filter(device -> device.belongsTo(donorId))
                .filter(device -> devices.isSignedIn(deviceId, clock.instant()));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Set<DeviceId> signedInAmong(Collection<DeviceId> deviceIds) {
        return devices.signedInAmong(deviceIds, clock.instant());
    }
}
