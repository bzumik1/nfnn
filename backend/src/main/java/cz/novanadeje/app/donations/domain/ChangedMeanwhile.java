package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.error.StaleWrite;

public class ChangedMeanwhile extends StaleWrite {

    public static final String CODE = "donations/changed-meanwhile";
    private static final String MESSAGE = "The record changed since the version the request names";

    public ChangedMeanwhile(String version) {
        super(CODE, MESSAGE, version);
    }

    private ChangedMeanwhile() {
        super(CODE, MESSAGE);
    }

    public static ChangedMeanwhile andRemovedSince() {
        return new ChangedMeanwhile();
    }
}
