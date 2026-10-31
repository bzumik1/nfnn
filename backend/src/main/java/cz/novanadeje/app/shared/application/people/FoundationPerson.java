package cz.novanadeje.app.shared.application.people;

import java.util.UUID;

public record FoundationPerson(UUID id, String name, boolean hasPortrait, boolean needsCorrection) {

    public FoundationPerson {
        if (id == null || name == null || name.isBlank()) {
            throw new IllegalArgumentException("A person of the foundation has an id and a name");
        }
    }

    public FoundationPerson(UUID id, String name, boolean hasPortrait) {
        this(id, name, hasPortrait, false);
    }
}
