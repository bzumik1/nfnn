package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record PasskeyId(UUID value) {

    public PasskeyId {
        if (value == null) {
            throw new IllegalArgumentException("Passkey id is required");
        }
    }

    public static PasskeyId newId(Instant at) {
        return new PasskeyId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
