package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "donation")
public class DonationJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "bank_payment_id", unique = true)
    private UUID bankPaymentId;

    @Column(name = "received_on", nullable = false)
    private LocalDate receivedOn;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Enumerated(EnumType.STRING)
    @Column(name = "currency", nullable = false, length = 3)
    private Currency currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 16)
    private DonationSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private DonationStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "paired_by", length = 16)
    private PairingMethod pairedBy;

    @Column(name = "sender_account_id")
    private UUID senderAccountId;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, length = 32)
    private DonationPurpose purpose;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected DonationJpaEntity() {
    }

    static DonationJpaEntity fromDomain(Donation donation) {
        DonationJpaEntity entity = new DonationJpaEntity();
        entity.id = donation.id().value();
        entity.donorId = donation.donor().value();
        entity.bankPaymentId = donation.bankPayment().map(BankPaymentId::value).orElse(null);
        entity.receivedOn = donation.receivedOn();
        entity.amountMinor = donation.amount().amountMinor();
        entity.currency = donation.amount().currency();
        entity.source = donation.source();
        entity.status = donation.status();
        entity.pairedBy = donation.pairedBy().orElse(null);
        entity.senderAccountId = donation.pairedThrough().map(SenderAccountLinkId::value).orElse(null);
        entity.purpose = donation.purpose();
        entity.recordedAt = donation.recordedAt();
        return entity;
    }

    Donation toDomain() {
        return Donation.reconstitute(
                new DonationId(id),
                new DonorReference(donorId),
                Optional.ofNullable(bankPaymentId).map(BankPaymentId::new),
                receivedOn,
                new Money(amountMinor, currency),
                source,
                status,
                Optional.ofNullable(pairedBy),
                Optional.ofNullable(senderAccountId).map(SenderAccountLinkId::new),
                purpose,
                recordedAt);
    }
}
