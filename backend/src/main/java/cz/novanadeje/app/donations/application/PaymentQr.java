package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;

public record PaymentQr(String spayd, byte[] pngImage, BankAccount recipient) {
}
