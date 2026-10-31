package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import jakarta.validation.constraints.Size;

public record FoundersNoteRequest(@Size(max = FoundersNote.MAX_LENGTH) String text) {
}
