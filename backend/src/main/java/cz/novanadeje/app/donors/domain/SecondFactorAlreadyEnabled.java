package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SecondFactorAlreadyEnabled extends Conflict {

    public SecondFactorAlreadyEnabled() {
        super("donors/second-factor-already-enabled", "The second factor is already enabled; disable it first");
    }
}
