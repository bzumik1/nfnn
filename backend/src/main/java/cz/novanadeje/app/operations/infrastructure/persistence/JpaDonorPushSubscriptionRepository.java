package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscription;
import cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaDonorPushSubscriptionRepository implements DonorPushSubscriptionRepository {

    static final int DONORS_PER_QUERY = 500;

    private final DonorPushSubscriptionJpaRepository jpa;
    private final EntityManager entityManager;

    JpaDonorPushSubscriptionRepository(DonorPushSubscriptionJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    public Optional<DonorPushSubscription> findOfDevice(UUID donorId, UUID deviceId) {
        return jpa.findByDonorIdAndDeviceId(donorId, deviceId).map(DonorPushSubscriptionJpaEntity::toDomain);
    }

    @Override
    public List<DonorPushSubscription> findAllOf(UUID donorId) {
        return jpa.findByDonorIdOrderByCreatedAtAscIdAsc(donorId).stream().map(DonorPushSubscriptionJpaEntity::toDomain).toList();
    }

    @Override
    public List<DonorPushSubscription> findWithGiftNotificationsOf(Collection<UUID> donorIds) {
        List<UUID> donors = List.copyOf(donorIds);
        List<DonorPushSubscription> found = new ArrayList<>();
        for (int from = 0; from < donors.size(); from += DONORS_PER_QUERY) {
            jpa.findByDonorIdInAndGiftNotificationsTrueOrderByCreatedAtAscIdAsc(donors.subList(from, Math.min(from + DONORS_PER_QUERY, donors.size())))
                    .forEach(entity -> found.add(entity.toDomain()));
        }
        return List.copyOf(found);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockWrites() {
        AdvisoryLock.PUSH_SUBSCRIPTION_WRITES.acquireFor(entityManager);
    }

    @Override
    public void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        jpa.deleteByEndpointOrDevice(endpoint.value(), deviceId);
    }

    @Override
    public void save(DonorPushSubscription subscription) {
        jpa.save(DonorPushSubscriptionJpaEntity.fromDomain(subscription));
    }

    @Override
    public boolean changeNotifications(UUID donorId, UUID deviceId, DonorNotifications notifications) {
        return jpa.changeNotifications(donorId, deviceId, notifications.gifts(), notifications.yearlyReceipts()) == 1;
    }

    @Override
    public void markDelivered(PushSubscriptionId id, Instant at) {
        jpa.markDelivered(id.value(), at);
    }

    @Override
    public Optional<Integer> markFailed(PushSubscriptionId id) {
        return jpa.markFailed(id.value()) == 0 ? Optional.empty() : jpa.failuresOf(id.value());
    }

    @Override
    public void delete(PushSubscriptionId id) {
        jpa.deleteOne(id.value());
    }

    @Override
    public int deleteAllOfDevice(UUID deviceId) {
        return jpa.deleteAllOfDevice(deviceId);
    }

    @Override
    public int deleteAllOf(UUID donorId) {
        return jpa.deleteAllOf(donorId);
    }

    @Override
    public int deleteAll() {
        return jpa.deleteEvery();
    }
}
