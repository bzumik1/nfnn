package cz.novanadeje.app.content.domain.people;

import java.time.Instant;
import java.util.Optional;

public record FoundersNote(Optional<String> text, Instant updatedAt) {

    public static final int MAX_LENGTH = 600;

    public FoundersNote {
        if (text == null || updatedAt == null) {
            throw new IllegalArgumentException("The founders' note has a text (even when absent) and the time of its last change");
        }
        text = text.map(FoundersNote::paragraphs).filter(paragraphs -> !paragraphs.isEmpty());
        if (text.isPresent() && text.get().length() > MAX_LENGTH) {
            throw new IllegalArgumentException("The founders' note is at most " + MAX_LENGTH + " characters");
        }
    }

    public static FoundersNote empty(Instant at) {
        return new FoundersNote(Optional.empty(), at);
    }

    private static String paragraphs(String value) {
        return value.replace("\r\n", "\n").replace('\r', '\n').strip().replaceAll("[ \\t]+\n", "\n").replaceAll("\n[ \\t]+\n", "\n\n")
                .replaceAll("\n{3,}", "\n\n");
    }
}
