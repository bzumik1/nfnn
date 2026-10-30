package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

public record PaymentDetails(BankAccount account, Currency currency, SpaydText recipientName, SpaydText donationMessage,
                             SpaydText accountVerificationMessage, Money accountVerificationAmount) {

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
                SpaydText.message(QrPaymentPurpose.DONATION.message()), SpaydText.message(QrPaymentPurpose.ACCOUNT_VERIFICATION.message()),
                DonationPurpose.VERIFICATION_AMOUNT);
    }
}
