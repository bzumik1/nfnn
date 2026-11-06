package cz.novanadeje.app.donors.application;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record AdminActionCursor(Instant before, Optional<UUID> beforeId) {

    public AdminActionCursor {
        Objects.requireNonNull(before, "before");
        Objects.requireNonNull(beforeId, "beforeId");
    }
}
