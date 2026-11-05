package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushKey;
import cz.novanadeje.app.operations.domain.push.PushKeyRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaPushKeyRepository implements PushKeyRepository {

    private final PushKeyJpaRepository jpa;
    private final EntityManager entityManager;

    JpaPushKeyRepository(PushKeyJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    public Optional<PushKey> find() {
        return jpa.findById(PushKeyJpaEntity.SINGLETON_ID).map(PushKeyJpaEntity::toDomain);
    }

    @Override
    public Optional<PushKey> findLocked() {
        Optional<PushKeyJpaEntity> held = Optional.ofNullable(entityManager.find(PushKeyJpaEntity.class, PushKeyJpaEntity.SINGLETON_ID));
        held.ifPresent(entity -> entityManager.refresh(entity, LockModeType.PESSIMISTIC_WRITE));
        return held.map(PushKeyJpaEntity::toDomain);
    }

    @Override
    public void insertIfAbsent(PushKey key) {
        jpa.insertIfAbsent(key.publicKey(), key.sealedPrivateKey(), key.createdAt());
    }

    @Override
    public void replace(PushKey key) {
        jpa.save(PushKeyJpaEntity.fromDomain(key));
    }
}
