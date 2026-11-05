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
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endOthersOf(DonorId donorId, Optional<DeviceId> kept, Instant at) {
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void end(DonorDevice device, DeviceSignOutReason reason, Instant at) {
    }
}
