package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;

public interface DonationReceiptRenderer {

    byte[] render(ReceiptDocument document);
}
