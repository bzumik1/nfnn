package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.Versioned;

import java.util.Optional;

public record FoundersNoteResponse(String text, String version) {

    static FoundersNoteResponse from(Versioned<Optional<String>> note) {
        return new FoundersNoteResponse(note.view().orElse(null), note.version());
    }
}
