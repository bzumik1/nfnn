package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.shared.domain.error.StaleWrite;

public class ChangedMeanwhile extends StaleWrite {

    public static final String CODE = "content/changed-meanwhile";

    public ChangedMeanwhile(String version) {
        super(CODE, "The record changed since the version the request names", version);
    }
}
