package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Service
public class SignedInDeviceCheck {

    private final DonorDeviceRepository devices;
    private final Clock clock;

    public SignedInDeviceCheck(DonorDeviceRepository devices, Clock clock) {
        this.devices = devices;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public boolean isSignedIn(DeviceId device) {
        return devices.isSignedIn(device, clock.instant());
    }
}
