package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
class JpaReceiptSigningKeyRepository implements ReceiptSigningKeyRepository {

    private final ReceiptSigningKeyJpaRepository keys;

    JpaReceiptSigningKeyRepository(ReceiptSigningKeyJpaRepository keys) {
        this.keys = keys;
    }

    @Override
    public List<ReceiptSigningKey> findAll() {
        return keys.findAll().stream().map(ReceiptSigningKeyJpaEntity::toDomain).toList();
    }

    @Override
    public void save(ReceiptSigningKey key) {
        keys.save(ReceiptSigningKeyJpaEntity.of(key));
    }
}
