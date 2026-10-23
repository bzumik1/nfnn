package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.application.qr.QrMatrix;

public record PaymentQr(String spayd, QrMatrix modules, BankAccount recipient) {
}
