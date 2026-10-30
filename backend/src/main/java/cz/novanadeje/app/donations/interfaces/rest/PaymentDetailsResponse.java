package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.payment.PaymentDetails;

record PaymentDetailsResponse(AccountResponse account, String currency, MessagesResponse messages, long accountVerificationAmountMinor) {

    static PaymentDetailsResponse from(PaymentDetails details) {
        return new PaymentDetailsResponse(
                new AccountResponse(details.account().accountNumber(), details.account().iban().value(), details.recipientName().value()),
                details.currency().name(),
                new MessagesResponse(details.donationMessage().value(), details.accountVerificationMessage().value()),
                details.accountVerificationAmount().amountMinor());
    }

    record AccountResponse(String number, String iban, String recipientName) {
    }

    record MessagesResponse(String donation, String accountVerification) {
    }
}
