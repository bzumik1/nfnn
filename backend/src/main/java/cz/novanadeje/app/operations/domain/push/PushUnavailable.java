package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PushUnavailable extends Conflict {

    public static final String CODE = "operations/push-unavailable";

    public PushUnavailable() {
        super(CODE, "Push alerts need the server's settings key");
    }
}
