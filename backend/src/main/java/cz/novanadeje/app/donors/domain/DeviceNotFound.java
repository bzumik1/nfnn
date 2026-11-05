package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class DeviceNotFound extends NotFound {

    public DeviceNotFound(DeviceId id) {
        super("donors/device-not-found", "Device " + id + " is not signed in to this account");
    }
}
