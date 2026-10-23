package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PasskeyLimitReached extends Conflict {

    public PasskeyLimitReached(int limit) {
        super("donors/passkey-limit-reached", "A donor keeps at most " + limit + " passkeys");
    }
}
