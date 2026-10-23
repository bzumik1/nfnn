package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class LastSignInMethod extends Conflict {

    public LastSignInMethod(DonorId id) {
        super("donors/last-sign-in-method", "Donor " + id + " would keep no way to sign in");
    }
}
