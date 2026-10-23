package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public record BackupRun(RunOutcome outcome, Instant startedAt, Instant finishedAt, Optional<String> fileName, Optional<Long> sizeBytes,
                        Optional<Integer> tables, Optional<String> requestId, Optional<String> error) {

    public BackupRun {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(startedAt, "startedAt");
        Objects.requireNonNull(finishedAt, "finishedAt");
        Objects.requireNonNull(fileName, "fileName");
        Objects.requireNonNull(sizeBytes, "sizeBytes");
        Objects.requireNonNull(tables, "tables");
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(error, "error");
    }

    public boolean succeeded() {
        return outcome == RunOutcome.OK;
    }
}
