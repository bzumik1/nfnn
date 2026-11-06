package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Objects;

public record MailDeliverySucceeded(Instant at) {

    public MailDeliverySucceeded {
        Objects.requireNonNull(at, "at");
    }
}
