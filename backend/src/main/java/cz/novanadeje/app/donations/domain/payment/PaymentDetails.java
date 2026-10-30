package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

public record PaymentDetails(BankAccount account, Currency currency, SpaydText recipientName, SpaydText donationMessage,
                             SpaydText accountVerificationMessage, Money accountVerificationAmount) {

    public static PaymentDetails of(BankAccount account) {
        throw new UnsupportedOperationException("not yet");
    }
}
