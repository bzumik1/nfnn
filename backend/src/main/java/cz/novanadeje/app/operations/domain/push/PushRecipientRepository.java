package cz.novanadeje.app.operations.domain.push;

import java.time.Instant;
import java.util.Optional;

public interface PushRecipientRepository {

    void markDelivered(PushSubscriptionId id, Instant at);

    Optional<Integer> markFailed(PushSubscriptionId id);

    void delete(PushSubscriptionId id);
}
