package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

class InMemoryPushSubscriptions implements PushSubscriptionRepository {

    private final Map<PushSubscriptionId, PushSubscription> rows = new LinkedHashMap<>();

    @Override
    public synchronized Optional<PushSubscription> findById(PushSubscriptionId id) {
        return Optional.ofNullable(rows.get(id));
    }

    @Override
    public synchronized List<PushSubscription> findAllOf(UUID administratorId) {
        return rows.values().stream().filter(row -> row.belongsTo(administratorId)).toList();
    }

    @Override
    public synchronized List<PushSubscription> findAllWithAlert(MonitoredArea area) {
        return rows.values().stream().filter(row -> row.alerts().covers(area)).toList();
    }

    @Override
    public synchronized void lockWrites() {
    }

    @Override
    public synchronized List<PushSubscription> findByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        return rows.values().stream().filter(row -> row.endpoint().equals(endpoint) || row.deviceId().equals(deviceId)).toList();
    }

    @Override
    public synchronized boolean changeAlerts(PushSubscriptionId id, UUID administratorId, PushAlerts alerts) {
        return rows.computeIfPresent(id, (key, row) -> row.belongsTo(administratorId) ? row.withAlerts(alerts) : row) != null
                && rows.get(id).belongsTo(administratorId);
    }

    @Override
    public synchronized void save(PushSubscription subscription) {
        rows.put(subscription.id(), subscription);
    }

    @Override
    public synchronized void delete(PushSubscriptionId id) {
        rows.remove(id);
    }

    @Override
    public synchronized void markDelivered(PushSubscriptionId id, Instant at) {
        rows.computeIfPresent(id, (key, row) -> new PushSubscription(row.id(), row.administratorId(), row.deviceId(), row.endpoint(), row.keys(),
                row.alerts(), row.createdAt(), Optional.of(at), 0));
    }

    @Override
    public synchronized Optional<Integer> markFailed(PushSubscriptionId id) {
        PushSubscription row = rows.computeIfPresent(id, (key, old) -> new PushSubscription(old.id(), old.administratorId(), old.deviceId(),
                old.endpoint(), old.keys(), old.alerts(), old.createdAt(), old.lastDeliveredAt(), old.failuresInARow() + 1));
        return Optional.ofNullable(row).map(PushSubscription::failuresInARow);
    }

    @Override
    public synchronized void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        rows.values().removeIf(row -> row.endpoint().equals(endpoint) || row.deviceId().equals(deviceId));
    }

    @Override
    public synchronized int deleteAllOfDevice(UUID deviceId) {
        return removeIf(row -> row.deviceId().equals(deviceId));
    }

    @Override
    public synchronized int deleteAllOf(UUID administratorId) {
        return removeIf(row -> row.belongsTo(administratorId));
    }

    @Override
    public synchronized int deleteAll() {
        return removeIf(row -> true);
    }

    synchronized List<PushSubscription> all() {
        return new ArrayList<>(rows.values());
    }

    private int removeIf(java.util.function.Predicate<PushSubscription> condition) {
        int before = rows.size();
        rows.values().removeIf(condition);
        return before - rows.size();
    }
}
