package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SecondFactorRecoveryUnavailable extends Conflict {

    public SecondFactorRecoveryUnavailable() {
        super("donors/second-factor-recovery-unavailable", "The donor has no bank account verified for a recovery by payment");
    }
}
