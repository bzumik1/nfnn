package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class PushDeviceRequired extends AccessDenied {

    public static final String CODE = "operations/push-device-required";

    public PushDeviceRequired() {
        super(CODE, "Push alerts are subscribed only from a signed-in device");
    }
}
