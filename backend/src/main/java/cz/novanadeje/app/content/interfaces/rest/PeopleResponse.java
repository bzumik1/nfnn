package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.PersonView;

import java.util.List;
import java.util.Optional;

public record PeopleResponse(List<PersonResponse> members, String note, String footnote) {

    static PeopleResponse from(List<PersonView> members, Optional<String> note, Optional<String> footnote) {
        return new PeopleResponse(members.stream().map(PersonResponse::from).toList(), note.orElse(null), footnote.orElse(null));
    }
}
