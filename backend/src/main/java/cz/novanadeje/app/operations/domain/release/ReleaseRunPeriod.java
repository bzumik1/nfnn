package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;
import java.util.Optional;

public record ReleaseRunPeriod(ReleaseRun run, Optional<Instant> endedAt) {

    public ReleaseRunPeriod {
        if (run == null || endedAt == null) {
            throw new IllegalArgumentException("A release run's period names the run and its end, empty while it runs");
        }
    }
}
