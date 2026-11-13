package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.RequestingDevice;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.shared.application.session.CurrentDevice;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Optional;

final class SessionDevices {

    private SessionDevices() {
    }

    static Optional<DeviceId> current(CurrentDevice device) {
        return device.id().map(DeviceId::new);
    }

    static RequestingDevice requesting(CurrentDevice device, HttpServletRequest http) {
        return new RequestingDevice(current(device), UserAgentDevice.of(http));
    }
}
