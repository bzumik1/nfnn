package cz.novanadeje.app.donations.domain.importing;

import java.time.Instant;
import java.util.Optional;

public record ImportRecovery(ImportFailureKind outageKind, int failures, Optional<Instant> lastSucceededBefore, Instant recoveredAt) {

    public ImportRecovery {
        if (outageKind == null || lastSucceededBefore == null || recoveredAt == null) {
            throw new IllegalArgumentException("A recovery names the outage, the success before it (even when absent) and when it happened");
        }
        if (failures < 1) {
            throw new IllegalArgumentException("A recovery follows at least one failure, but has " + failures);
        }
    }
}
