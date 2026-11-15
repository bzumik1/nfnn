package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.StaleWrite;

public class ProfileChangedMeanwhile extends StaleWrite {

    public static final String CODE = "donors/changed-meanwhile";

    public ProfileChangedMeanwhile(String version) {
        super(CODE, "The profile changed since the version the request names", version);
    }
}
