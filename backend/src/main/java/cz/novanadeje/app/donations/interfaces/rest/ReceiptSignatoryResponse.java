package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ChosenSignatoryView;
import cz.novanadeje.app.donations.application.receipt.ReceiptSignatoryView;

import java.time.Instant;
import java.util.UUID;

record ReceiptSignatoryResponse(ChosenResponse signatory) {

    static ReceiptSignatoryResponse from(ReceiptSignatoryView view) {
        return new ReceiptSignatoryResponse(view.chosen().map(ChosenResponse::from).orElse(null));
    }

    record ChosenResponse(UUID personId, String name, String receiptRole, Instant chosenAt, boolean portrait, boolean portraitPrintable,
                         boolean signature) {

        static ChosenResponse from(ChosenSignatoryView view) {
            return new ChosenResponse(view.person().value(), view.name(), view.receiptRole(), view.chosenAt(), view.hasPortrait(),
                    view.portraitPrintable(), view.hasSignature());
        }
    }
}
