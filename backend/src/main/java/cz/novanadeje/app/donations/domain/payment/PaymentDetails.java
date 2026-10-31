package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

import java.util.StringJoiner;

public record PaymentDetails(BankAccount account, Currency currency, SpaydText recipientName, SpaydText donationMessage,
                             SpaydText accountVerificationMessage, Money accountVerificationAmount) {

    private static final String DONATION_MESSAGE = "Dar Nadační fond Nová naděje";
    private static final String ACCOUNT_VERIFICATION_MESSAGE = "Ověření účtu Nadační fond Nová naděje";
    private static final String HEADER = "SPD*1.0";
    private static final String FIELD_SEPARATOR = "*";
    private static final long LARGEST_AMOUNT_MINOR = 999_999_999L;

    public PaymentDetails {
        if (account == null || currency == null || recipientName == null || donationMessage == null || accountVerificationMessage == null
                || accountVerificationAmount == null) {
            throw new IllegalArgumentException("Payment details need the account, the currency, the recipient, both messages and the verification amount");
        }
        if (recipientName.value().length() > SpaydText.RECIPIENT_NAME_LENGTH) {
            throw new IllegalArgumentException("The recipient's SPAYD text holds at most " + SpaydText.RECIPIENT_NAME_LENGTH + " characters: " + recipientName);
        }
        if (donationMessage.isEmpty() || accountVerificationMessage.isEmpty()) {
            throw new IllegalArgumentException("Payment details need a donation message and an account verification message that are not empty");
        }
        if (!accountVerificationAmount.isPositive() || accountVerificationAmount.currency() != currency) {
            throw new IllegalArgumentException("The verification amount must be positive and in the payments' currency: " + accountVerificationAmount);
        }
    }

    public static PaymentDetails of(BankAccount account) {
        return new PaymentDetails(account, Currency.CZK, SpaydText.recipientName(account.recipientName()),
                SpaydText.message(DONATION_MESSAGE), SpaydText.message(ACCOUNT_VERIFICATION_MESSAGE), DonationPurpose.VERIFICATION_AMOUNT);
    }

    public String spaydWithoutVariableSymbol(Money amount, SpaydText message) {
        if (amount == null || !amount.isPositive() || amount.amountMinor() > LARGEST_AMOUNT_MINOR || message == null || message.isEmpty()) {
            throw new IllegalArgumentException("A SPAYD text needs a positive amount that fits AM and a message: " + amount);
        }
        StringJoiner spayd = new StringJoiner(FIELD_SEPARATOR).add(HEADER)
                .add("ACC:" + account.iban().value())
                .add("AM:" + amount.toDecimal().toPlainString())
                .add("CC:" + currency.name());
        if (!recipientName.isEmpty()) {
            spayd.add("RN:" + recipientName.value());
        }
        return spayd.add("MSG:" + message.value()).toString();
    }
}
