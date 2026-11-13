package cz.novanadeje.app.operations.domain.push;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record DonorPushSubscription(PushSubscriptionId id, UUID donorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys keys,
                                    DonorNotifications notifications, Instant createdAt, Optional<Instant> lastDeliveredAt, int failuresInARow)
        implements PushRecipient {

    public static final int MAX_PER_DONOR = 10;

    public DonorPushSubscription {
        if (id == null || donorId == null || deviceId == null || endpoint == null || keys == null || notifications == null
                || createdAt == null || lastDeliveredAt == null || failuresInARow < 0) {
            throw new IllegalArgumentException("A donor's push subscription names its donor, device, endpoint, keys, notifications and times");
        }
    }

    public static DonorPushSubscription subscribe(UUID donorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys keys,
                                                  DonorNotifications notifications, Instant now) {
        return new DonorPushSubscription(PushSubscriptionId.generate(now), donorId, deviceId, endpoint, keys, notifications, now, Optional.empty(), 0);
    }

    public DonorPushSubscription withNotifications(DonorNotifications changed) {
        return new DonorPushSubscription(id, donorId, deviceId, endpoint, keys, changed, createdAt, lastDeliveredAt, failuresInARow);
    }

    public boolean belongsTo(UUID donor) {
        return donorId.equals(donor);
    }

    @Override
    public String toString() {
        return "DonorPushSubscription[id=" + id.value() + ", donorId=" + donorId + ", deviceId=" + deviceId + ", service=" + endpoint.service()
                + ", notifications=" + notifications + ", failuresInARow=" + failuresInARow + "]";
    }
}
