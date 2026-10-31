package cz.novanadeje.app.shared.application.people;

import java.util.UUID;

public record FoundationPerson(UUID id, String name, boolean hasPortrait) {

    public FoundationPerson {
        if (id == null || name == null || name.isBlank()) {
            throw new IllegalArgumentException("A person of the foundation has an id and a name");
        }
    }
}
