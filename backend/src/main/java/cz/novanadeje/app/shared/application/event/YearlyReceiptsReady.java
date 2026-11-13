package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record YearlyReceiptsReady(Set<UUID> donorIds, Instant at) {

    public YearlyReceiptsReady {
        if (donorIds == null || donorIds.isEmpty() || at == null) {
            throw new IllegalArgumentException("Ready yearly receipts name at least one donor and the moment");
        }
        donorIds = Set.copyOf(donorIds);
    }
}
