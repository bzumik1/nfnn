package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.MediaId;

final class MediaUrls {

    static final String PATH = "/api/content/media/";

    private MediaUrls() {
    }

    static String of(MediaId id) {
        return PATH + id;
    }
}
