package cz.novanadeje.app.operations.domain.push;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DonorPushSubscriptionRepository {

    Optional<DonorPushSubscription> findOfDevice(UUID donorId, UUID deviceId);

    List<DonorPushSubscription> findAllOf(UUID donorId);

    void lockWrites();

    void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId);

    void save(DonorPushSubscription subscription);

    boolean changeNotifications(UUID donorId, UUID deviceId, DonorNotifications notifications);

    void markDelivered(PushSubscriptionId id, Instant at);

    Optional<Integer> markFailed(PushSubscriptionId id);

    void delete(PushSubscriptionId id);

    int deleteAllOfDevice(UUID deviceId);

    int deleteAllOf(UUID donorId);

    int deleteAll();
}
