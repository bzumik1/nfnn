package cz.novanadeje.app.donations.application.receipt;

import java.util.Optional;

public record ReceiptSignatoryView(Optional<ChosenSignatoryView> chosen) {
}
