package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Component
public class DeviceSignOuts {

    private final DonorDeviceRepository devices;
    private final RefreshTokenRepository refreshTokens;
    private final ApplicationEventPublisher events;

    public DeviceSignOuts(DonorDeviceRepository devices, RefreshTokenRepository refreshTokens, ApplicationEventPublisher events) {
        this.devices = devices;
        this.refreshTokens = refreshTokens;
        this.events = events;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endAllOf(DonorId donorId, DeviceSignOutReason reason, Instant at) {
        endAllOf(donorId, Optional.empty(), reason, at);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endAllOf(DonorId donorId, Optional<DeviceId> continuing, DeviceSignOutReason reason, Instant at) {
        refreshTokens.revokeAllOf(donorId, at);
        devices.findActiveOf(donorId).stream()
                .filter(device -> continuing.filter(device.id()::equals).isEmpty())
                .forEach(device -> end(device, reason, at));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endOthersOf(DonorId donorId, Optional<DeviceId> kept, Instant at) {
        refreshTokens.lockAllOf(donorId);
        refreshTokens.revokeDevicelessBrowserTokensOf(donorId, at);
        devices.findActiveOf(donorId).stream()
                .filter(device -> kept.filter(device.id()::equals).isEmpty())
                .forEach(device -> end(device, DeviceSignOutReason.REMOTE_SIGN_OUT, at));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean end(DonorId donorId, DeviceId deviceId, DeviceSignOutReason reason, Instant at) {
        refreshTokens.lockAllOf(donorId);
        return devices.findById(deviceId)
                .filter(device -> device.belongsTo(donorId) && device.isActive())
                .map(device -> end(device, reason, at))
                .orElse(false);
    }

    private boolean end(DonorDevice device, DeviceSignOutReason reason, Instant at) {
        refreshTokens.revokeAllOfDevice(device.id(), at);
        boolean ended = devices.endIfActive(device.id(), reason, at);
        if (ended) {
            events.publishEvent(new DeviceSignedOut(device.donorId().value(), device.id().value(), at));
        }
        return ended;
    }
}
