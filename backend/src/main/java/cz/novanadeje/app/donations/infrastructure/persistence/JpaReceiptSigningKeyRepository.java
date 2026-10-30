package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
class JpaReceiptSigningKeyRepository implements ReceiptSigningKeyRepository {

    private final ReceiptSigningKeyJpaRepository keys;
    private final ReceiptSigningKeyAdoptionJpaRepository adoptions;

    JpaReceiptSigningKeyRepository(ReceiptSigningKeyJpaRepository keys, ReceiptSigningKeyAdoptionJpaRepository adoptions) {
        this.keys = keys;
        this.adoptions = adoptions;
    }

    @Override
    public List<ReceiptSigningKey> findAll() {
        return keys.findAll().stream().map(ReceiptSigningKeyJpaEntity::toDomain).toList();
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
