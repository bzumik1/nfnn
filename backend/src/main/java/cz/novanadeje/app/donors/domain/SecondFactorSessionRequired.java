package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class SecondFactorSessionRequired extends AccessDenied {

    public SecondFactorSessionRequired(DonorId id) {
        super("donors/second-factor-session-required", "Donor " + id + " changes a second factor only in a session opened with one");
    }
}
