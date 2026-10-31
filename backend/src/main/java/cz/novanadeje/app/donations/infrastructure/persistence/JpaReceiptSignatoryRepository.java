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
        jpa.upsert(ReceiptSignatoryJpaEntity.SINGLETON_ID, signatory.person().value(), signatory.receiptRole(), signatory.chosenAt());
    }

    @Override
    public boolean signsReceipts(UUID personId) {
        return jpa.findLockedById(ReceiptSignatoryJpaEntity.SINGLETON_ID).map(ReceiptSignatoryJpaEntity::toDomain)
                .filter(signatory -> signatory.person().value().equals(personId))
                .isPresent();
    }
}
