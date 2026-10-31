package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.SignatureSummary;

import java.util.List;
import java.util.Optional;

public record ReceiptSignatoryView(Optional<ChosenSignatoryView> chosen, List<SignatureSummary> signatures) {
}
