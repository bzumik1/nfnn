package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.shared.application.people.ReceiptSignatoryLookup;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
class JpaReceiptSignatoryRepository implements ReceiptSignatoryRepository, ReceiptSignatoryLookup {

    private final ReceiptSignatoryJpaRepository jpa;

    JpaReceiptSignatoryRepository(ReceiptSignatoryJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<ReceiptSignatory> current() {
        return jpa.findById(ReceiptSignatoryJpaEntity.SINGLETON_ID).map(ReceiptSignatoryJpaEntity::toDomain);
    }

    @Override
    public void choose(ReceiptSignatory signatory) {
        jpa.save(ReceiptSignatoryJpaEntity.of(signatory));
    }

    @Override
    public boolean signsReceipts(UUID personId) {
        return jpa.existsByIdAndPersonId(ReceiptSignatoryJpaEntity.SINGLETON_ID, personId);
    }
}
