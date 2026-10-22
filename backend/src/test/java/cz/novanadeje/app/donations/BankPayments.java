package cz.novanadeje.app.donations;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public final class BankPayments {

    public static final Instant IMPORTED_AT = Instant.parse("2026-10-17T10:00:00Z");
    public static final LocalDate BOOKED_ON = LocalDate.of(2026, 10, 15);
    public static final String PAYER_NAME = "Nováková Jana";

    private BankPayments() {
    }

    public static BankPayment payment(long transactionId, Optional<SenderAccount> sender, String variableSymbol) {
        return payment(transactionId, BOOKED_ON, Money.czk(50000), sender, variableSymbol);
    }

    public static BankPayment payment(long transactionId, LocalDate bookedOn, Money amount, Optional<SenderAccount> sender,
                                      String variableSymbol) {
        return payment(transactionId, bookedOn, amount, sender, variableSymbol, null);
    }

    public static BankPayment payment(long transactionId, LocalDate bookedOn, Money amount, Optional<SenderAccount> sender,
                                      String variableSymbol, String messageForRecipient) {
        return payment(transactionId, bookedOn, amount, sender, variableSymbol, messageForRecipient, Optional.of(PAYER_NAME));
    }

    public static BankPayment payment(long transactionId, LocalDate bookedOn, Money amount, Optional<SenderAccount> sender,
                                      String variableSymbol, String messageForRecipient, Optional<String> counterpartyName) {
        return BankPayment.incoming(BankPaymentId.newId(IMPORTED_AT), IncomingMovement.of(new BankTransactionId(transactionId), bookedOn,
                amount, sender, sender.map(SenderAccount::accountNumber), sender.map(SenderAccount::bankCode), counterpartyName,
                Optional.ofNullable(variableSymbol), Optional.empty(), Optional.empty(), Optional.ofNullable(messageForRecipient),
                "Bezhotovostní příjem"), IMPORTED_AT);
    }
}
