package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record PersonId(UUID value) {

    public PersonId {
        if (value == null) {
            throw new IllegalArgumentException("Person id is required");
        }
    }

    public static PersonId newId(Instant at) {
        return new PersonId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
