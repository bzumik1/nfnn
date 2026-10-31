package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.PersonImageView;

import java.util.UUID;

public record PersonImageResponse(UUID id, String url, int width, int height) {

    static PersonImageResponse from(PersonImageView view) {
        return new PersonImageResponse(view.id().value(), MediaUrls.of(view.id()), view.width(), view.height());
    }
}
