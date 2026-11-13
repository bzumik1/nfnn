package cz.novanadeje.app.operations.domain.push;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record PushSubscription(PushSubscriptionId id, UUID administratorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys keys,
                               PushAlerts alerts, Instant createdAt, Optional<Instant> lastDeliveredAt, int failuresInARow)
        implements PushRecipient {

    public static final int MAX_PER_ADMINISTRATOR = 10;
    public static final int FAILURES_WORTH_A_WARNING = 3;

    public PushSubscription {
        if (id == null || administratorId == null || deviceId == null || endpoint == null || keys == null || alerts == null
                || createdAt == null || lastDeliveredAt == null || failuresInARow < 0) {
            throw new IllegalArgumentException("A push subscription names its administrator, device, endpoint, keys, alerts and times");
        }
    }

    public static PushSubscription subscribe(UUID administratorId, UUID deviceId, PushEndpoint endpoint, PushClientKeys keys, PushAlerts alerts,
                                             Instant now) {
        return new PushSubscription(PushSubscriptionId.generate(now), administratorId, deviceId, endpoint, keys, alerts, now, Optional.empty(), 0);
    }

    public PushSubscription withAlerts(PushAlerts changed) {
        return new PushSubscription(id, administratorId, deviceId, endpoint, keys, changed, createdAt, lastDeliveredAt, failuresInARow);
    }

    public static boolean failingLongEnoughToWarn(int failuresInARow) {
        return failuresInARow == FAILURES_WORTH_A_WARNING;
    }

    public boolean belongsTo(UUID administrator) {
        return administratorId.equals(administrator);
    }

    @Override
    public String toString() {
        return "PushSubscription[id=" + id.value() + ", administratorId=" + administratorId + ", deviceId=" + deviceId + ", service="
                + endpoint.service() + ", alerts=" + alerts + ", failuresInARow=" + failuresInARow + "]";
    }
}
