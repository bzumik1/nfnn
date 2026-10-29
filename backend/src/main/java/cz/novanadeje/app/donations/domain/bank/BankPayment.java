package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.bank.BankTexts.normalized;
import static cz.novanadeje.app.donations.domain.bank.BankTexts.require;
import static cz.novanadeje.app.donations.domain.bank.BankTexts.required;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.CONSTANT_SYMBOL_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.COUNTERPARTY_ACCOUNT_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.COUNTERPARTY_BANK_CODE_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.COUNTERPARTY_NAME_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.MESSAGE_FOR_RECIPIENT_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.SPECIFIC_SYMBOL_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.TRANSACTION_TYPE_LENGTH;
import static cz.novanadeje.app.donations.domain.bank.IncomingMovement.VARIABLE_SYMBOL_LENGTH;

public record BankPayment(
        BankPaymentId id,
        BankTransactionId transactionId,
        LocalDate bookedOn,
        Money amount,
        Optional<SenderAccount> sender,
        Optional<String> counterpartyAccount,
        Optional<String> counterpartyBankCode,
        Optional<String> counterpartyName,
        Optional<String> variableSymbol,
        Optional<VariableSymbol> matchingVariableSymbol,
        Optional<String> constantSymbol,
        Optional<String> specificSymbol,
        Optional<String> messageForRecipient,
        String transactionType,
        Instant importedAt,
        Optional<Instant> unpairedByAdminAt) {

    public BankPayment {
        require(id, "Bank payment id");
        require(transactionId, "Bank transaction id");
        require(bookedOn, "Booking date");
        IncomingMovement.requirePositive(amount);
        require(sender, "Sender");
        counterpartyAccount = normalized(counterpartyAccount, COUNTERPARTY_ACCOUNT_LENGTH);
        counterpartyBankCode = normalized(counterpartyBankCode, COUNTERPARTY_BANK_CODE_LENGTH);
        counterpartyName = normalized(counterpartyName, COUNTERPARTY_NAME_LENGTH);
        variableSymbol = normalized(variableSymbol, VARIABLE_SYMBOL_LENGTH);
        IncomingMovement.requireMatching(variableSymbol, matchingVariableSymbol);
        constantSymbol = normalized(constantSymbol, CONSTANT_SYMBOL_LENGTH);
        specificSymbol = normalized(specificSymbol, SPECIFIC_SYMBOL_LENGTH);
        messageForRecipient = normalized(messageForRecipient, MESSAGE_FOR_RECIPIENT_LENGTH);
        transactionType = required(transactionType, TRANSACTION_TYPE_LENGTH, "Transaction type");
        require(importedAt, "Import time");
        require(unpairedByAdminAt, "Admin unpairing time");
    }

    public static BankPayment incoming(BankPaymentId id, IncomingMovement movement, Instant importedAt) {
        return new BankPayment(id, movement.id(), movement.bookedOn(), movement.amount(), movement.sender(),
                movement.counterpartyAccount(), movement.counterpartyBankCode(), movement.counterpartyName(),
                movement.variableSymbol(), movement.matchingVariableSymbol(), movement.constantSymbol(),
                movement.specificSymbol(), movement.messageForRecipient(), movement.transactionType(), importedAt, Optional.empty());
    }

    public BankPayment unpairedByAdmin(Instant at) {
        return new BankPayment(id, transactionId, bookedOn, amount, sender, counterpartyAccount, counterpartyBankCode, counterpartyName,
                variableSymbol, matchingVariableSymbol, constantSymbol, specificSymbol, messageForRecipient, transactionType, importedAt,
                Optional.of(require(at, "Admin unpairing time")));
    }

    public boolean isPairedByHandOnly() {
        return unpairedByAdminAt.isPresent();
    }

    public boolean carriesVariableSymbol() {
        return matchingVariableSymbol.isPresent();
    }

    public Optional<VariableSymbol> symbolInMessage() {
        return carriesVariableSymbol() ? Optional.empty() : messageForRecipient.flatMap(VariableSymbols::inMessage);
    }

    public Optional<VariableSymbol> pairingSymbol() {
        return matchingVariableSymbol.or(this::symbolInMessage);
    }

    public boolean hasSender() {
        return sender.isPresent();
    }
}
