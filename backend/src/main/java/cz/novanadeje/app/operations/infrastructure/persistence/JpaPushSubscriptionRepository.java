package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.operations.domain.push.PushSubscription;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaPushSubscriptionRepository implements PushSubscriptionRepository {

    static final long WRITE_LOCK_KEY = 20261105L;

    private final PushSubscriptionJpaRepository jpa;
    private final EntityManager entityManager;

    JpaPushSubscriptionRepository(PushSubscriptionJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    public Optional<PushSubscription> findById(PushSubscriptionId id) {
        return jpa.findById(id.value()).map(PushSubscriptionJpaEntity::toDomain);
    }

    @Override
    public List<PushSubscription> findAllOf(UUID administratorId) {
        return jpa.findByAdministratorIdOrderByCreatedAtAscIdAsc(administratorId).stream().map(PushSubscriptionJpaEntity::toDomain).toList();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockWrites() {
        entityManager.createNativeQuery("select 1 from pg_advisory_xact_lock(:key)").setParameter("key", WRITE_LOCK_KEY).getSingleResult();
    }

    @Override
    public List<PushSubscription> findByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        return jpa.findByEndpointOrDeviceId(endpoint.value(), deviceId).stream().map(PushSubscriptionJpaEntity::toDomain).toList();
    }

    @Override
    public boolean changeAlerts(PushSubscriptionId id, UUID administratorId, PushAlerts alerts) {
        return jpa.changeAlerts(id.value(), administratorId, alerts.bankImport(), alerts.backups(), alerts.mail()) == 1;
    }

    @Override
    public void save(PushSubscription subscription) {
        jpa.save(PushSubscriptionJpaEntity.fromDomain(subscription));
    }

    @Override
    public void delete(PushSubscriptionId id) {
        jpa.deleteOne(id.value());
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
    public void deleteByEndpointOrDevice(PushEndpoint endpoint, UUID deviceId) {
        jpa.deleteByEndpointOrDevice(endpoint.value(), deviceId);
    }

    @Override
    public int deleteAllOfDevice(UUID deviceId) {
        return jpa.deleteAllOfDevice(deviceId);
    }

    @Override
    public int deleteAllOf(UUID administratorId) {
        return jpa.deleteAllOf(administratorId);
    }

    @Override
    public int deleteAll() {
        return jpa.deleteEvery();
    }
}
