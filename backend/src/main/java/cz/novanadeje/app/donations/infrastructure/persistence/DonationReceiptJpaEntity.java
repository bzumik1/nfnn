package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.LocaleCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "donation_receipt")
public class DonationReceiptJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 10)
    private ReceiptKind kind;

    @Column(name = "donation_id")
    private UUID donationId;

    @Column(name = "receipt_year")
    private Integer receiptYear;

    @Column(name = "number", nullable = false, unique = true, length = 11)
    private String number;

    @Column(name = "issued_on", nullable = false)
    private LocalDate issuedOn;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "locale", nullable = false, length = 2)
    private String locale;

    @Column(name = "fingerprint", nullable = false, length = 64)
    private String fingerprint;

    @Column(name = "content", nullable = false)
    private byte[] content;

    @Column(name = "supersedes_id")
    private UUID supersedesId;

    @Column(name = "superseded_at")
    private Instant supersededAt;

    protected DonationReceiptJpaEntity() {
    }

    static DonationReceiptJpaEntity fromDomain(DonationReceipt receipt) {
        DonationReceiptJpaEntity entity = new DonationReceiptJpaEntity();
        entity.id = receipt.id().value();
        entity.donorId = receipt.donor().value();
        entity.kind = receipt.kind();
        entity.donationId = receipt.donation().map(DonationId::value).orElse(null);
        entity.receiptYear = receipt.year().map(Year::getValue).orElse(null);
        entity.number = receipt.number().value();
        entity.issuedOn = receipt.issuedOn();
        entity.issuedAt = receipt.issuedAt();
        entity.locale = receipt.locale().tag();
        entity.fingerprint = receipt.fingerprint().value();
        entity.content = receipt.content();
        entity.supersedesId = receipt.supersedes().map(DonationReceiptId::value).orElse(null);
        entity.supersededAt = receipt.supersededAt().orElse(null);
        return entity;
    }

    DonationReceipt toDomain() {
        return DonationReceipt.reconstitute(
                new DonationReceiptId(id),
                new DonorReference(donorId),
                kind,
                Optional.ofNullable(donationId).map(DonationId::new),
                Optional.ofNullable(receiptYear).map(Year::of),
                new ReceiptNumber(number),
                issuedOn,
                issuedAt,
                LocaleCode.fromTag(locale),
                new ReceiptFingerprint(fingerprint),
                content,
                Optional.ofNullable(supersedesId).map(DonationReceiptId::new),
                Optional.ofNullable(supersededAt));
    }
}
