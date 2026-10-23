package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;

import java.time.Instant;
import java.util.Objects;

public record BackupRequest(String id, BackupRequestKind kind, Instant requestedAt) {

    public BackupRequest {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(kind, "kind");
        Objects.requireNonNull(requestedAt, "requestedAt");
    }
}
