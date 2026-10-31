package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;

public record AdminReceiptView(DonationReceipt receipt, boolean donorErased) {
}
