package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.Versioned;

import java.util.Optional;

public record PeopleFootnoteResponse(String text, String version) {

    static PeopleFootnoteResponse from(Versioned<Optional<String>> footnote) {
        return new PeopleFootnoteResponse(footnote.view().orElse(null), footnote.version());
    }
}
