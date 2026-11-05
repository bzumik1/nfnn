package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record DonorSessionsEnded(UUID donorId, Instant endedAt) {

    public DonorSessionsEnded {
        Objects.requireNonNull(donorId, "donorId");
        Objects.requireNonNull(endedAt, "endedAt");
    }
}
