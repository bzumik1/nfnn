package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record DonationsArrived(Set<UUID> donorIds, Instant at) {

    public DonationsArrived {
        if (donorIds == null || donorIds.isEmpty() || at == null) {
            throw new IllegalArgumentException("Arrived donations name at least one donor and the moment");
        }
        donorIds = Set.copyOf(donorIds);
    }
}
