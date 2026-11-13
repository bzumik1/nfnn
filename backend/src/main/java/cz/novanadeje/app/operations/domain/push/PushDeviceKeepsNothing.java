package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PushDeviceKeepsNothing extends Conflict {

    public static final String CODE = "operations/push-device-keeps-nothing";

    public PushDeviceKeepsNothing() {
        super(CODE, "A public computer session keeps nothing on the device, push notifications included");
    }
}
