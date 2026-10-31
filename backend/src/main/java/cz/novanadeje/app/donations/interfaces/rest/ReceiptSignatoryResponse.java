package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ChosenSignatoryView;
import cz.novanadeje.app.donations.application.receipt.ReceiptSignatoryView;
import cz.novanadeje.app.donations.domain.receipt.SignatureKind;
import cz.novanadeje.app.donations.domain.receipt.SignatureSummary;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record ReceiptSignatoryResponse(ChosenResponse signatory, List<SignatureResponse> signatures) {

    static ReceiptSignatoryResponse from(ReceiptSignatoryView view) {
        return new ReceiptSignatoryResponse(view.chosen().map(ChosenResponse::from).orElse(null),
                view.signatures().stream().map(SignatureResponse::from).toList());
    }

    record ChosenResponse(UUID personId, String name, String receiptRole, Instant chosenAt, boolean portrait, boolean portraitPrintable,
                         boolean signature) {

        static ChosenResponse from(ChosenSignatoryView view) {
            return new ChosenResponse(view.person().value(), view.name(), view.receiptRole(), view.chosenAt(), view.hasPortrait(),
                    view.portraitPrintable(), view.hasSignature());
        }
    }

    record SignatureResponse(UUID personId, SignatureKind kind, int width, int height, Instant uploadedAt) {

        static SignatureResponse from(SignatureSummary summary) {
            return new SignatureResponse(summary.person().value(), summary.kind(), summary.width(), summary.height(), summary.uploadedAt());
        }
    }
}
