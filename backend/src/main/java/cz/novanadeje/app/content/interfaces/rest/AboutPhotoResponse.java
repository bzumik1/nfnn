package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.about.AboutPhotoView;

import java.util.UUID;

public record AboutPhotoResponse(UUID id, String url, int width, int height, String alt, String caption) {

    static AboutPhotoResponse from(AboutPhotoView view) {
        return new AboutPhotoResponse(view.id().value(), MediaUrls.of(view.id()), view.width(), view.height(), view.alt().orElse(null),
                view.caption().orElse(null));
    }
}
