package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaRefreshTokenRepository implements RefreshTokenRepository {

    private final RefreshTokenJpaRepository jpa;
    private final ApplicationEventPublisher events;
    private final EntityManager entityManager;

    JpaRefreshTokenRepository(RefreshTokenJpaRepository jpa, ApplicationEventPublisher events, EntityManager entityManager) {
        this.jpa = jpa;
        this.events = events;
        this.entityManager = entityManager;
    }

    @Override
    public void save(RefreshToken token) {
        jpa.save(RefreshTokenJpaEntity.fromDomain(token));
    }

    @Override
    public Optional<RefreshToken> findBySecretHash(String secretHash) {
        return jpa.findBySecretHash(secretHash).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public Optional<RefreshToken> findById(UUID id) {
        return jpa.findById(id).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public Optional<RefreshToken> findBySecretHashForUpdate(String secretHash) {
        return jpa.findForUpdateBySecretHash(secretHash).map(RefreshTokenJpaEntity::toDomain);
    }

    @Override
    public Optional<DonorId> findDonorOfSecretHash(String secretHash) {
        return jpa.findDonorIdBySecretHash(secretHash).map(DonorId::new);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockSessionsOf(DonorId donorId) {
        AdvisoryLock.DONOR_SESSIONS.acquireFor(entityManager, donorId.value().toString());
    }

    @Override
    public void recordSuccessor(UUID tokenId, UUID successorId) {
        jpa.recordSuccessor(tokenId, successorId);
    }

    @Override
    public boolean revokeIfUnused(UUID tokenId, Instant at) {
        return jpa.revokeIfUnused(tokenId, at) == 1;
    }

    @Override
    public boolean supersedeIfUnused(UUID tokenId, Instant at) {
        return jpa.supersedeIfUnused(tokenId, at) == 1;
    }

    @Override
    public boolean markUsed(UUID tokenId, Instant at) {
        return jpa.markUsed(tokenId, at) == 1;
    }

    @Override
    public List<RefreshToken> findUsableClientTokensOf(DonorId donorId, Instant now) {
        return jpa.findUsableClientTokensOf(donorId.value(), now).stream().map(RefreshTokenJpaEntity::toDomain).toList();
    }

    @Override
    public void lockAllOf(DonorId donorId) {
        jpa.lockAllOfInIdOrder(donorId.value());
    }

    @Override
    public void revokeAllOf(DonorId donorId, Instant at) {
        jpa.lockAllOfInIdOrder(donorId.value());
        jpa.revokeAllOf(donorId.value(), at);
        events.publishEvent(new DonorSessionsEnded(donorId.value(), at));
    }

    @Override
    public void revokeAllOfDevice(DeviceId deviceId, Instant at) {
        jpa.revokeAllOfDevice(deviceId.value(), at);
    }

    @Override
    public void revokeDevicelessBrowserTokensOf(DonorId donorId, Instant at) {
        jpa.revokeDevicelessBrowserTokensOf(donorId.value(), at);
    }

    @Override
    public int deleteSpentBefore(Instant cutoff) {
        jpa.lockSpentBeforeInIdOrder(cutoff);
        return jpa.deleteSpentBefore(cutoff);
    }
}
