package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.PushService;

import java.time.Instant;
import java.util.Optional;

public record DonorPushDeviceView(PushService service, DonorNotifications notifications, Instant createdAt, Optional<Instant> lastDeliveredAt,
                                  int failuresInARow) {

    static DonorPushDeviceView of(DonorPushSubscription subscription) {
        return new DonorPushDeviceView(subscription.endpoint().service(), subscription.notifications(), subscription.createdAt(),
                subscription.lastDeliveredAt(), subscription.failuresInARow());
    }
}
