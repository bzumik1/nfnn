package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SetupCompleted extends Conflict {

    public static final String CODE = "operations/setup-completed";

    public SetupCompleted() {
        super(CODE, "The first setup is done; settings change in the administration");
    }
}
