package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.donateband.DonateBandView;

public record DonateBandResponse(DonateBandPhotoResponse photo) {

    static DonateBandResponse from(DonateBandView view) {
        return new DonateBandResponse(view.photo().map(DonateBandPhotoResponse::from).orElse(null));
    }
}
