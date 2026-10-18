package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_sender_account")
@IdClass(DonorSenderAccountKey.class)
public class DonorSenderAccountJpaEntity {

    @Id
    @Column(name = "donor_id")
    private UUID donorId;

    @Id
    @Column(name = "account_number", length = SenderAccount.MAX_ACCOUNT_NUMBER_LENGTH)
    private String accountNumber;

    @Id
    @Column(name = "bank_code", length = SenderAccount.BANK_CODE_LENGTH)
    private String bankCode;

    @Column(name = "learned_from_payment_id", nullable = false)
    private UUID learnedFromPaymentId;

    @Column(name = "learned_at", nullable = false)
    private Instant learnedAt;

    protected DonorSenderAccountJpaEntity() {
    }

    UUID donorId() {
        return donorId;
    }

    DonorSenderAccountKey key() {
        return new DonorSenderAccountKey(donorId, accountNumber, bankCode);
    }

    LearnedSenderAccount toDomain() {
        return new LearnedSenderAccount(new SenderAccount(accountNumber, bankCode), new BankPaymentId(learnedFromPaymentId), learnedAt);
    }
}
