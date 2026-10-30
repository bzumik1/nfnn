package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.payment.PaymentDetails;

record PaymentDetailsResponse(AccountResponse account, String currency, MessagesResponse messages, long accountVerificationAmountMinor) {

    static PaymentDetailsResponse from(PaymentDetails details) {
        throw new UnsupportedOperationException("not yet");
    }

    record AccountResponse(String number, String iban, String recipientName) {
    }

    record MessagesResponse(String donation, String accountVerification) {
    }
}
