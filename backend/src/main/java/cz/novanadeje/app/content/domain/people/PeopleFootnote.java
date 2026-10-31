package cz.novanadeje.app.content.domain.people;

import java.time.Instant;
import java.util.Optional;

public record PeopleFootnote(Optional<String> text, Instant updatedAt) {

    public static final int MAX_LENGTH = 200;

    public PeopleFootnote {
        if (text == null || updatedAt == null) {
            throw new IllegalArgumentException("The footnote of the people has a text (even when absent) and the time of its last change");
        }
        text = text.map(value -> value.strip().replaceAll("\\s+", " ")).filter(line -> !line.isEmpty());
        if (text.isPresent() && text.get().length() > MAX_LENGTH) {
            throw new IllegalArgumentException("The footnote of the people is at most " + MAX_LENGTH + " characters");
        }
    }

    public static PeopleFootnote empty(Instant at) {
        return new PeopleFootnote(Optional.empty(), at);
    }
}
