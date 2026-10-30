package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.PersonView;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.UUID;

public record PersonResponse(UUID id, String name, String role, int position, boolean onBoard, String boardNote, boolean featured,
                             PersonImageResponse portrait, PersonImageResponse webSignature, String personalEmail,
                             String fundEmail) {

    static PersonResponse from(PersonView view) {
        return new PersonResponse(view.id().value(), view.name(), view.role().orElse(null), view.position(), view.onBoard(),
                view.boardNote().orElse(null), view.featured(), view.portrait().map(PersonImageResponse::from).orElse(null),
                view.webSignature().map(PersonImageResponse::from).orElse(null), view.personalEmail().map(EmailAddress::value).orElse(null),
                view.fundEmail().map(EmailAddress::value).orElse(null));
    }
}
