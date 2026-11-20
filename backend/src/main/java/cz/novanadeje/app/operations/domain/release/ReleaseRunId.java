package cz.novanadeje.app.operations.domain.release;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record ReleaseRunId(UUID value) {

    public ReleaseRunId {
        if (value == null) {
            throw new IllegalArgumentException("A release run id is required");
        }
    }

    public static ReleaseRunId generate(Instant now) {
        return new ReleaseRunId(UuidV7.generate(now));
    }
}
