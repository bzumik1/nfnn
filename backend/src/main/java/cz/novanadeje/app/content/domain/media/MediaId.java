package cz.novanadeje.app.content.domain.media;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record MediaId(UUID value) {

    public MediaId {
        if (value == null) {
            throw new IllegalArgumentException("Media id is required");
        }
    }

    public static MediaId newId(Instant at) {
        return new MediaId(UuidV7.generate(at));
    }

    public static MediaId of(String value) {
        return new MediaId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
