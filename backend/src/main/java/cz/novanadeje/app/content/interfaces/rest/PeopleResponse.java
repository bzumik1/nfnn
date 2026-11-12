package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.application.people.PersonView;

import java.util.List;
import java.util.Optional;

public record PeopleResponse(List<PersonResponse> members, String note, String noteVersion, String footnote, String footnoteVersion) {

    static PeopleResponse from(List<PersonView> members, Versioned<Optional<String>> note, Versioned<Optional<String>> footnote) {
        return new PeopleResponse(members.stream().map(PersonResponse::from).toList(), note.view().orElse(null), note.version(),
                footnote.view().orElse(null), footnote.version());
    }
}
