package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushService;
import cz.novanadeje.app.operations.domain.push.PushSubscription;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record PushSubscriptionView(UUID id, PushService service, PushAlerts alerts, Instant createdAt, Optional<Instant> lastDeliveredAt,
                                   int failuresInARow) {

    static PushSubscriptionView of(PushSubscription subscription) {
        return new PushSubscriptionView(subscription.id().value(), subscription.endpoint().service(), subscription.alerts(),
                subscription.createdAt(), subscription.lastDeliveredAt(), subscription.failuresInARow());
    }
}
