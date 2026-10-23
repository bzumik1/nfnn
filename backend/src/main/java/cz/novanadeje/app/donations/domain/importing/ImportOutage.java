package cz.novanadeje.app.donations.domain.importing;

import java.time.Instant;
import java.util.Optional;

public record ImportOutage(ImportFailureKind kind, int consecutiveFailures, Optional<Instant> lastSucceededAt, Instant detectedAt) implements ImportAlert {

    public ImportOutage {
        if (kind == null || lastSucceededAt == null || detectedAt == null) {
            throw new IllegalArgumentException("An outage names its kind, the last success (even when absent) and when it was detected");
        }
        if (consecutiveFailures < 1) {
            throw new IllegalArgumentException("An outage has at least one failure, but has " + consecutiveFailures);
        }
    }

    public boolean tokenRejected() {
        return kind == ImportFailureKind.UNAUTHORIZED;
    }
}
