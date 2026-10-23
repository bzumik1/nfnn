package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.UUID;

public record CoverImageResponse(UUID id, String url) {

    static CoverImageResponse of(MediaId id) {
        return new CoverImageResponse(id.value(), MediaUrls.of(id));
    }
}
