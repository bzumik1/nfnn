package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceStatus;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class DeviceStatusService {

    private final DonorDeviceRepository devices;
    private final DonorRepository donors;

    public DeviceStatusService(DonorDeviceRepository devices, DonorRepository donors) {
        this.devices = devices;
        this.donors = donors;
    }

    @Transactional(readOnly = true)
    public DeviceStatusView statusOf(DeviceStatusSecret secret) {
        Optional<DonorDevice> device = devices.findByStatusSecretHash(secret.hash());
        if (device.isEmpty()) {
            return new DeviceStatusView(DeviceStatus.UNKNOWN, false);
        }
        DeviceStatus status = device.get().status();
        boolean keepsAccount = status == DeviceStatus.SIGNED_IN || status == DeviceStatus.SIGNED_OUT;
        boolean administrator = keepsAccount && donors.findById(device.get().donorId())
                .filter(Donor::isAdministrator)
                .isPresent();
        return new DeviceStatusView(status, administrator);
    }

    public record DeviceStatusView(DeviceStatus status, boolean administrator) {
    }
}
