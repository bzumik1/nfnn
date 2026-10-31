package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donation_receipt_signatory")
class ReceiptSignatoryJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "person_id", nullable = false)
    private UUID personId;

    @Column(name = "receipt_role", nullable = false, length = ReceiptSignatory.MAX_ROLE_LENGTH)
    private String receiptRole;

    @Column(name = "chosen_at", nullable = false)
    private Instant chosenAt;

    protected ReceiptSignatoryJpaEntity() {
    }

    static ReceiptSignatoryJpaEntity of(ReceiptSignatory signatory) {
        ReceiptSignatoryJpaEntity entity = new ReceiptSignatoryJpaEntity();
        entity.id = SINGLETON_ID;
        entity.personId = signatory.person().value();
        entity.receiptRole = signatory.receiptRole();
        entity.chosenAt = signatory.chosenAt();
        return entity;
    }

    ReceiptSignatory toDomain() {
        return new ReceiptSignatory(new PersonReference(personId), receiptRole, chosenAt);
    }
}
