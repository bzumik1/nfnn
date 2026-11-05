package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;

import java.util.Optional;

public record RequestingDevice(Optional<DeviceId> session, DeviceDescription description) {

    public RequestingDevice {
        if (session == null || description == null) {
            throw new IllegalArgumentException("A requesting device needs its session, which may be absent, and its description");
        }
    }
}
