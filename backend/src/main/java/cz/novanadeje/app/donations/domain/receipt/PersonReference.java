package cz.novanadeje.app.donations.domain.receipt;

import java.util.UUID;

public record PersonReference(UUID value) {

    public PersonReference {
        if (value == null) {
            throw new IllegalArgumentException("Person reference is required");
        }
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
