package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PushSubscriptionRepository {

    Optional<PushSubscription> findById(PushSubscriptionId id);

    List<PushSubscription> findAllOf(UUID administratorId);

    List<PushSubscription> findAllWithAlert(MonitoredArea area);

    void lockWrites();

    List<PushSubscription> findByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId);

    void save(PushSubscription subscription);

    boolean changeAlerts(PushSubscriptionId id, UUID administratorId, PushAlerts alerts);

    void delete(PushSubscriptionId id);

    void markDelivered(PushSubscriptionId id, Instant at);

    Optional<Integer> markFailed(PushSubscriptionId id);

    void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId);

    int deleteAllOfDevice(UUID deviceId);

    int deleteAllOf(UUID administratorId);

    int deleteAll();
}
