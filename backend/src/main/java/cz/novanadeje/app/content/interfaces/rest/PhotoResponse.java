package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.media.PhotoView;

import java.util.UUID;

public record PhotoResponse(UUID id, String url, int width, int height, FocalPointResponse focalPoint) {

    static PhotoResponse from(PhotoView view) {
        return new PhotoResponse(view.id().value(), MediaUrls.of(view.id()), view.width(), view.height(), FocalPointResponse.of(view.focalPoint()));
    }
}
