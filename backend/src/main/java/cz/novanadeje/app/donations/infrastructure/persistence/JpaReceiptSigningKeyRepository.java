package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
class JpaReceiptSigningKeyRepository implements ReceiptSigningKeyRepository {

    private final ReceiptSigningKeyJpaRepository keys;
    private final ReceiptSigningKeyAdoptionJpaRepository adoptions;
    private final EntityManager entityManager;

    JpaReceiptSigningKeyRepository(ReceiptSigningKeyJpaRepository keys, ReceiptSigningKeyAdoptionJpaRepository adoptions, EntityManager entityManager) {
        this.keys = keys;
        this.adoptions = adoptions;
        this.entityManager = entityManager;
    }

    @Override
    public List<ReceiptSigningKey> findAll() {
        return keys.findAll().stream().map(ReceiptSigningKeyJpaEntity::toDomain).toList();
    }

    @Override
    public Optional<ReceiptSigningKey> lockForWithdrawal(ReceiptSigningKeyId id) {
        return keys.findForUpdate(id.value()).map(this::lockedState);
    }

    private ReceiptSigningKey lockedState(ReceiptSigningKeyJpaEntity locked) {
        entityManager.refresh(locked);
        return locked.toDomain();
    }

    @Override
    public void save(ReceiptSigningKey key) {
        keys.save(ReceiptSigningKeyJpaEntity.of(key));
    }

    @Override
    public boolean recordRestoreAdoption(String restoreId, Instant adoptedAt) {
        if (restoreId.length() > ReceiptSigningKeyAdoptionJpaEntity.MAX_RESTORE_ID_LENGTH) {
            throw new IllegalArgumentException("A restore id is at most " + ReceiptSigningKeyAdoptionJpaEntity.MAX_RESTORE_ID_LENGTH + " characters");
        }
        return adoptions.insertIfAbsent(restoreId, adoptedAt) == 1;
    }
}
