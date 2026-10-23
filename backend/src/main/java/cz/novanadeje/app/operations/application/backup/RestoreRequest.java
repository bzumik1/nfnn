package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.RestoreSource;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record RestoreRequest(String id, RestoreSource source, String fileName, Optional<UUID> requestedBy, Instant requestedAt) {

    public RestoreRequest {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(fileName, "fileName");
        Objects.requireNonNull(requestedBy, "requestedBy");
        Objects.requireNonNull(requestedAt, "requestedAt");
    }
}
