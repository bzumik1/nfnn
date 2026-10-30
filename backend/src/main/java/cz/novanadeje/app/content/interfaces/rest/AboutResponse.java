package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.about.AboutView;

public record AboutResponse(AboutPhotoResponse photo) {

    static AboutResponse from(AboutView view) {
        return new AboutResponse(view.photo().map(AboutPhotoResponse::from).orElse(null));
    }
}
