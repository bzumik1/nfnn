package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class SetupLocked extends AccessDenied {

    public static final String CODE = "operations/setup-locked";

    public SetupLocked() {
        super(CODE, "The first setup opens from the home network or with the code from the backend's container log");
    }
}
