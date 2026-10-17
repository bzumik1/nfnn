package cz.novanadeje.app.contact.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record ContactMessageId(UUID value) {

    public ContactMessageId {
        if (value == null) {
            throw new IllegalArgumentException("Contact message id is required");
        }
    }

    public static ContactMessageId newId(Instant at) {
        return new ContactMessageId(UuidV7.generate(at));
    }
}
