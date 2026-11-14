package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

public class PushDeviceSignedOut extends AuthenticationFailure {

    public static final String CODE = "auth/session-ended";

    public PushDeviceSignedOut() {
        super(CODE, "The device is no longer signed in, so it cannot take push notifications");
    }
}
