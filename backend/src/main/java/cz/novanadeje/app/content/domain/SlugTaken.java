package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SlugTaken extends Conflict {

    public static final String CODE = "content/slug-taken";

    public SlugTaken() {
        super(CODE, "Another article already uses the slug");
    }
}
