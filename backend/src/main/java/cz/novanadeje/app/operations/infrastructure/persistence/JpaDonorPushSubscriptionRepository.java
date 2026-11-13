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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaDonorPushSubscriptionRepository implements DonorPushSubscriptionRepository {

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
