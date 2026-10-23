package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.PaymentQr;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.application.qr.QrMatrix;

record PaymentQrResponse(String spayd, QrCodeResponse qrCode, BankAccountResponse bankAccount) {

    static PaymentQrResponse from(PaymentQr qr) {
        return new PaymentQrResponse(qr.spayd(), QrCodeResponse.from(qr.modules()), BankAccountResponse.from(qr.recipient()));
    }

    record QrCodeResponse(int size, String modules) {

        static QrCodeResponse from(QrMatrix matrix) {
            return new QrCodeResponse(matrix.size(), matrix.modules());
        }
    }

    record BankAccountResponse(String accountNumber, String iban, String recipientName) {

        static BankAccountResponse from(BankAccount account) {
            return new BankAccountResponse(account.accountNumber(), account.iban().value(), account.recipientName());
        }
    }
}
