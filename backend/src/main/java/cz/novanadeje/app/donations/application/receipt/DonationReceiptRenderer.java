package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;

import java.time.Instant;

public interface DonationReceiptRenderer {

    ReceiptSnapshot freeze(ReceiptDocument document);

    byte[] render(ReceiptSnapshot snapshot, ReceiptNumber number, Instant issuedAt);
}
