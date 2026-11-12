package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.donateband.DonateBandPhotoView;

import java.util.UUID;

public record DonateBandPhotoResponse(UUID id, String url, int width, int height, String alt, FocalPointResponse focalPoint) {

    static DonateBandPhotoResponse from(DonateBandPhotoView view) {
        return new DonateBandPhotoResponse(view.id().value(), MediaUrls.of(view.id()), view.width(), view.height(), view.alt().orElse(null),
                FocalPointResponse.of(view.focalPoint()));
    }
}
