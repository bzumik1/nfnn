package cz.novanadeje.app.shared.infrastructure.live;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record LiveSubscriber(UUID donor, boolean administrator, Instant issuedAt, Instant expiresAt) {

    public LiveSubscriber {
        Objects.requireNonNull(donor, "donor");
        Objects.requireNonNull(issuedAt, "issuedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
    }
}
