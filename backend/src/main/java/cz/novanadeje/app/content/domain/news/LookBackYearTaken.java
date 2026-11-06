package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class LookBackYearTaken extends Conflict {

    public static final String CODE = "content/look-back-year-taken";

    public LookBackYearTaken(int year) {
        super(CODE, "Another news article already looks back on the year " + year);
    }
}
