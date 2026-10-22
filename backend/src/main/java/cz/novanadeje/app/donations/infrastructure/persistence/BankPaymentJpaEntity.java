package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
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
@Table(name = "bank_payment")
public class BankPaymentJpaEntity {

    @Id
    private UUID id;

    @Column(name = "bank_transaction_id", nullable = false, unique = true)
    private Long transactionId;

    @Column(name = "booked_on", nullable = false)
    private LocalDate bookedOn;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Enumerated(EnumType.STRING)
    @Column(name = "currency", nullable = false, length = 3)
    private Currency currency;

    @Column(name = "sender_account_number", length = SenderAccount.MAX_ACCOUNT_NUMBER_LENGTH)
    private String senderAccountNumber;

    @Column(name = "sender_bank_code", length = SenderAccount.BANK_CODE_LENGTH)
    private String senderBankCode;

    @Column(name = "counterparty_account", length = IncomingMovement.COUNTERPARTY_ACCOUNT_LENGTH)
    private String counterpartyAccount;

    @Column(name = "counterparty_bank_code", length = IncomingMovement.COUNTERPARTY_BANK_CODE_LENGTH)
    private String counterpartyBankCode;

    @Column(name = "counterparty_name", length = IncomingMovement.COUNTERPARTY_NAME_LENGTH)
    private String counterpartyName;

    @Column(name = "variable_symbol", length = IncomingMovement.VARIABLE_SYMBOL_LENGTH)
    private String variableSymbol;

    @Column(name = "matching_variable_symbol", length = VariableSymbol.MAX_LENGTH)
    private String matchingVariableSymbol;

    @Column(name = "constant_symbol", length = IncomingMovement.CONSTANT_SYMBOL_LENGTH)
    private String constantSymbol;

    @Column(name = "specific_symbol", length = IncomingMovement.SPECIFIC_SYMBOL_LENGTH)
    private String specificSymbol;

    @Column(name = "message_for_recipient", length = IncomingMovement.MESSAGE_FOR_RECIPIENT_LENGTH)
    private String messageForRecipient;

    @Column(name = "transaction_type", nullable = false, length = IncomingMovement.TRANSACTION_TYPE_LENGTH)
    private String transactionType;

    @Column(name = "imported_at", nullable = false)
    private Instant importedAt;

    @Column(name = "unpaired_by_admin_at")
    private Instant unpairedByAdminAt;

    protected BankPaymentJpaEntity() {
    }

    static BankPaymentJpaEntity fromDomain(BankPayment payment) {
        BankPaymentJpaEntity entity = new BankPaymentJpaEntity();
        entity.id = payment.id().value();
        entity.transactionId = payment.transactionId().value();
        entity.bookedOn = payment.bookedOn();
        entity.amountMinor = payment.amount().amountMinor();
        entity.currency = payment.amount().currency();
        entity.senderAccountNumber = payment.sender().map(SenderAccount::accountNumber).orElse(null);
        entity.senderBankCode = payment.sender().map(SenderAccount::bankCode).orElse(null);
        entity.counterpartyAccount = payment.counterpartyAccount().orElse(null);
        entity.counterpartyBankCode = payment.counterpartyBankCode().orElse(null);
        entity.counterpartyName = payment.counterpartyName().orElse(null);
        entity.variableSymbol = payment.variableSymbol().orElse(null);
        entity.matchingVariableSymbol = payment.matchingVariableSymbol().map(VariableSymbol::value).orElse(null);
        entity.constantSymbol = payment.constantSymbol().orElse(null);
        entity.specificSymbol = payment.specificSymbol().orElse(null);
        entity.messageForRecipient = payment.messageForRecipient().orElse(null);
        entity.transactionType = payment.transactionType();
        entity.importedAt = payment.importedAt();
        entity.unpairedByAdminAt = payment.unpairedByAdminAt().orElse(null);
        return entity;
    }

    BankPayment toDomain() {
        return new BankPayment(
                new BankPaymentId(id),
                new BankTransactionId(transactionId),
                bookedOn,
                new Money(amountMinor, currency),
                sender(),
                Optional.ofNullable(counterpartyAccount),
                Optional.ofNullable(counterpartyBankCode),
                Optional.ofNullable(counterpartyName),
                Optional.ofNullable(variableSymbol),
                Optional.ofNullable(matchingVariableSymbol).map(VariableSymbol::new),
                Optional.ofNullable(constantSymbol),
                Optional.ofNullable(specificSymbol),
                Optional.ofNullable(messageForRecipient),
                transactionType,
                importedAt,
                Optional.ofNullable(unpairedByAdminAt));
    }

    private Optional<SenderAccount> sender() {
        if (senderAccountNumber == null || senderBankCode == null) {
            return Optional.empty();
        }
        return Optional.of(new SenderAccount(senderAccountNumber, senderBankCode));
    }
}
