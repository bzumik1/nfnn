package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

class InMemoryDonorPushSubscriptions implements DonorPushSubscriptionRepository {

    private final Map<PushSubscriptionId, DonorPushSubscription> rows = new LinkedHashMap<>();

    @Override
    public synchronized Optional<DonorPushSubscription> findOfDevice(UUID donorId, UUID deviceId) {
        return rows.values().stream().filter(row -> row.belongsTo(donorId) && row.deviceId().equals(deviceId)).findFirst();
    }

    @Override
    public synchronized List<DonorPushSubscription> findAllOf(UUID donorId) {
        return rows.values().stream().filter(row -> row.belongsTo(donorId)).toList();
    }

    @Override
    public synchronized List<DonorPushSubscription> findWithGiftNotificationsOf(Collection<UUID> donorIds) {
        return rows.values().stream().filter(row -> donorIds.contains(row.donorId()) && row.notifications().gifts()).toList();
    }

    @Override
    public synchronized void lockWrites() {
    }

    @Override
    public synchronized void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        rows.values().removeIf(row -> row.endpoint().equals(endpoint) || row.deviceId().equals(deviceId));
    }

    @Override
    public synchronized void save(DonorPushSubscription subscription) {
        rows.put(subscription.id(), subscription);
    }

    @Override
    public synchronized boolean changeNotifications(UUID donorId, UUID deviceId, DonorNotifications notifications) {
        Optional<DonorPushSubscription> found = findOfDevice(donorId, deviceId);
        found.ifPresent(row -> rows.put(row.id(), row.withNotifications(notifications)));
        return found.isPresent();
    }

    @Override
    public synchronized void markDelivered(PushSubscriptionId id, Instant at) {
        rows.computeIfPresent(id, (key, row) -> new DonorPushSubscription(row.id(), row.donorId(), row.deviceId(), row.endpoint(), row.keys(),
                row.notifications(), row.createdAt(), Optional.of(at), 0));
    }

    @Override
    public synchronized Optional<Integer> markFailed(PushSubscriptionId id) {
        DonorPushSubscription changed = rows.computeIfPresent(id, (key, row) -> new DonorPushSubscription(row.id(), row.donorId(), row.deviceId(),
                row.endpoint(), row.keys(), row.notifications(), row.createdAt(), row.lastDeliveredAt(), row.failuresInARow() + 1));
        return Optional.ofNullable(changed).map(DonorPushSubscription::failuresInARow);
    }

    @Override
    public synchronized void delete(PushSubscriptionId id) {
        rows.remove(id);
    }

    @Override
    public synchronized int deleteAllOfDevice(UUID deviceId) {
        return removeAll(rows.values().stream().filter(row -> row.deviceId().equals(deviceId)).toList());
    }

    @Override
    public synchronized int deleteAllOf(UUID donorId) {
        return removeAll(rows.values().stream().filter(row -> row.belongsTo(donorId)).toList());
    }

    @Override
    public synchronized int deleteAll() {
        int removed = rows.size();
        rows.clear();
        return removed;
    }

    synchronized List<DonorPushSubscription> all() {
        return List.copyOf(rows.values());
    }

    private int removeAll(List<DonorPushSubscription> removed) {
        removed.forEach(row -> rows.remove(row.id()));
        return removed.size();
    }
}
