package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceNotFound;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class DonorDevicesService {

    private final DonorDeviceRepository devices;
    private final DeviceSignOuts signOuts;
    private final Clock clock;

    public DonorDevicesService(DonorDeviceRepository devices, DeviceSignOuts signOuts, Clock clock) {
        this.devices = devices;
        this.signOuts = signOuts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<DeviceView> list(DonorId donorId, Optional<DeviceId> current) {
        return devices.findSignedInOf(donorId, clock.instant()).stream()
                .map(device -> new DeviceView(device.id(), device.description(), device.kind(), device.signedInAt(), device.lastUsedAt(),
                        current.filter(device.id()::equals).isPresent()))
                .sorted(Comparator.comparing(DeviceView::current).reversed()
                        .thenComparing(Comparator.comparing(DeviceView::lastUsedAt).reversed())
                        .thenComparing(view -> view.description().platform())
                        .thenComparing(view -> view.description().browser())
                        .thenComparing(view -> view.id().value()))
                .toList();
    }

    @Transactional
    public void signOut(DonorId donorId, DeviceId deviceId) {
        if (!signOuts.end(donorId, deviceId, DeviceSignOutReason.REMOTE_SIGN_OUT, clock.instant())) {
            throw new DeviceNotFound(deviceId);
        }
    }

    @Transactional
    public void signOutOthers(DonorId donorId, Optional<DeviceId> current) {
        signOuts.endOthersOf(donorId, current, clock.instant());
    }
}
