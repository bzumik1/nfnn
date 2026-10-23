package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
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
@Table(name = "donor_sender_account")
class DonorSenderAccountJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "account_number", nullable = false, length = SenderAccount.MAX_ACCOUNT_NUMBER_LENGTH)
    private String accountNumber;

    @Column(name = "bank_code", nullable = false, length = SenderAccount.BANK_CODE_LENGTH)
    private String bankCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private SenderAccountLinkStatus status;

    @Column(name = "learned_from_payment_id")
    private UUID learnedFromPaymentId;

    @Column(name = "learned_at")
    private Instant learnedAt;

    @Column(name = "valid_from")
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "disconnected_at")
    private Instant disconnectedAt;

    protected DonorSenderAccountJpaEntity() {
    }

    UUID id() {
        return id;
    }

    UUID donorId() {
        return donorId;
    }

    void updateFrom(SenderAccountLink link) {
        if (!link.id().value().equals(id) || !link.account().equals(new SenderAccount(accountNumber, bankCode))) {
            throw new IllegalArgumentException("Sender account link " + link.id() + " cannot change its account");
        }
        this.status = link.status();
        this.learnedFromPaymentId = link.provedBy().map(BankPaymentId::value).orElse(null);
        this.learnedAt = link.provedAt().orElse(null);
        this.validTo = link.validTo().orElse(null);
        this.disconnectedAt = link.disconnectedAt().orElse(null);
    }

    SenderAccountLink toDomain() {
        return SenderAccountLink.reconstitute(
                new SenderAccountLinkId(id),
                new SenderAccount(accountNumber, bankCode),
                status,
                Optional.ofNullable(learnedFromPaymentId).map(BankPaymentId::new),
                Optional.ofNullable(learnedAt),
                Optional.ofNullable(validFrom),
                Optional.ofNullable(validTo),
                createdAt,
                Optional.ofNullable(disconnectedAt));
    }
}
