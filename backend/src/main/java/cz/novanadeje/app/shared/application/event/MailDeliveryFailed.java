package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Objects;

public record MailDeliveryFailed(Instant at) {

    public MailDeliveryFailed {
        Objects.requireNonNull(at, "at");
    }
}
