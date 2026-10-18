package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.bank.BankTexts.normalized;
import static cz.novanadeje.app.donations.domain.bank.BankTexts.require;
import static cz.novanadeje.app.donations.domain.bank.BankTexts.required;

public record IncomingMovement(
        BankTransactionId id,
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
        String transactionType) {

    public static final int COUNTERPARTY_ACCOUNT_LENGTH = 64;
    public static final int COUNTERPARTY_BANK_CODE_LENGTH = 10;
    public static final int COUNTERPARTY_NAME_LENGTH = 255;
    public static final int VARIABLE_SYMBOL_LENGTH = 20;
    public static final int CONSTANT_SYMBOL_LENGTH = 10;
    public static final int SPECIFIC_SYMBOL_LENGTH = 10;
    public static final int MESSAGE_FOR_RECIPIENT_LENGTH = 500;
    public static final int TRANSACTION_TYPE_LENGTH = 100;

    public IncomingMovement {
        require(id, "Bank transaction id");
        require(bookedOn, "Booking date");
        requirePositive(amount);
        require(sender, "Sender");
        counterpartyAccount = normalized(counterpartyAccount, COUNTERPARTY_ACCOUNT_LENGTH);
        counterpartyBankCode = normalized(counterpartyBankCode, COUNTERPARTY_BANK_CODE_LENGTH);
        counterpartyName = normalized(counterpartyName, COUNTERPARTY_NAME_LENGTH);
        variableSymbol = normalized(variableSymbol, VARIABLE_SYMBOL_LENGTH);
        requireMatching(variableSymbol, matchingVariableSymbol);
        constantSymbol = normalized(constantSymbol, CONSTANT_SYMBOL_LENGTH);
        specificSymbol = normalized(specificSymbol, SPECIFIC_SYMBOL_LENGTH);
        messageForRecipient = normalized(messageForRecipient, MESSAGE_FOR_RECIPIENT_LENGTH);
        transactionType = required(transactionType, TRANSACTION_TYPE_LENGTH, "Transaction type");
    }

    public static IncomingMovement of(BankTransactionId id, LocalDate bookedOn, Money amount, Optional<SenderAccount> sender,
                                      Optional<String> counterpartyAccount, Optional<String> counterpartyBankCode,
                                      Optional<String> counterpartyName, Optional<String> variableSymbol,
                                      Optional<String> constantSymbol, Optional<String> specificSymbol,
                                      Optional<String> messageForRecipient, String transactionType) {
        return new IncomingMovement(id, bookedOn, amount, sender, counterpartyAccount, counterpartyBankCode, counterpartyName,
                variableSymbol, matchingFormOf(variableSymbol), constantSymbol, specificSymbol, messageForRecipient, transactionType);
    }

    static void requirePositive(Money amount) {
        if (!require(amount, "Amount").isPositive()) {
            throw new IllegalArgumentException("An incoming payment has a positive amount: " + amount);
        }
    }

    static void requireMatching(Optional<String> variableSymbol, Optional<VariableSymbol> matchingVariableSymbol) {
        Optional<VariableSymbol> expected = VariableSymbols.forMatching(variableSymbol.orElse(null));
        if (!expected.equals(require(matchingVariableSymbol, "Matching variable symbol"))) {
            throw new IllegalArgumentException("Matching variable symbol " + matchingVariableSymbol
                    + " does not follow from the variable symbol " + variableSymbol);
        }
    }

    private static Optional<VariableSymbol> matchingFormOf(Optional<String> variableSymbol) {
        return VariableSymbols.forMatching(normalized(variableSymbol, VARIABLE_SYMBOL_LENGTH).orElse(null));
    }
}
