package cz.novanadeje.app.content.domain.media;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class MediaNotFound extends NotFound {

    public static final String CODE = "content/media-not-found";

    public MediaNotFound(MediaId id) {
        super(CODE, "Media " + id + " does not exist");
    }
}
