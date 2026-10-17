package cz.novanadeje.app.donations.application;

public record GeneratePaymentQrQuery(long amountCzk, String variableSymbol) {
}
