package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;

public record ReceiptLineView(String receivedOnCs, String receivedOnEn, String amountCs, String amountEn) {

    static ReceiptLineView of(ReceiptLine line) {
        return new ReceiptLineView(ReceiptFormats.czechDate(line.receivedOn()), ReceiptFormats.englishDate(line.receivedOn()),
                ReceiptFormats.czechAmount(line.amount()), ReceiptFormats.englishAmount(line.amount()));
    }
}
