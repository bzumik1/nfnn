package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.PaymentQr;
import cz.novanadeje.app.donations.domain.BankAccount;

import java.util.Base64;

record PaymentQrResponse(String spayd, String qrPngBase64, BankAccountResponse bankAccount) {

    static PaymentQrResponse from(PaymentQr qr) {
        return new PaymentQrResponse(qr.spayd(), Base64.getEncoder().encodeToString(qr.pngImage()), BankAccountResponse.from(qr.recipient()));
    }

    record BankAccountResponse(String accountNumber, String iban, String recipientName) {

        static BankAccountResponse from(BankAccount account) {
            return new BankAccountResponse(account.accountNumber(), account.iban().value(), account.recipientName());
        }
    }
}
