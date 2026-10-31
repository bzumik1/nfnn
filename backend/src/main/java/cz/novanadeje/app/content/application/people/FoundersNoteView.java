package cz.novanadeje.app.content.application.people;

import java.util.List;

public record FoundersNoteView(String text, List<SignatureView> signatures) {

    public FoundersNoteView {
        signatures = List.copyOf(signatures);
    }
}
