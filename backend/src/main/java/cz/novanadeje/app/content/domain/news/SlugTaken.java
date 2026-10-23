package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SlugTaken extends Conflict {

    public static final String CODE = "content/slug-taken";

    public SlugTaken(Slug slug) {
        super(CODE, "Another article already uses the slug " + slug);
    }
}
