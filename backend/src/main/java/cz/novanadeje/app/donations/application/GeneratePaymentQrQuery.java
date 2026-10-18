package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;

public record GeneratePaymentQrQuery(long amountCzk, String variableSymbol, QrPaymentPurpose purpose) {
}
