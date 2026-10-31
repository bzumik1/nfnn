package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import jakarta.validation.constraints.Size;

public record PeopleFootnoteRequest(@Size(max = PeopleFootnote.MAX_LENGTH) String text) {
}
