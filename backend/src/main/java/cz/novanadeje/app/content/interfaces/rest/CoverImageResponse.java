package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;
import java.util.UUID;

public record CoverImageResponse(UUID id, String url, String alt) {

    static CoverImageResponse of(MediaId id, Optional<String> alt) {
        return new CoverImageResponse(id.value(), MediaUrls.of(id), alt.orElse(null));
    }
}
