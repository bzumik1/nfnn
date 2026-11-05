package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record PushSubscriptionId(UUID value) {

    public PushSubscriptionId {
        if (value == null) {
            throw new IllegalArgumentException("A push subscription id is required");
        }
    }

    public static PushSubscriptionId generate(Instant now) {
        return new PushSubscriptionId(UuidV7.generate(now));
    }
}
