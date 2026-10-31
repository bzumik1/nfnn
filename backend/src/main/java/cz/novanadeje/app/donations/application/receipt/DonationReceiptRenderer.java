package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;

import java.time.Instant;

public interface DonationReceiptRenderer {

    byte[] render(FrozenReceipt receipt, Instant issuedAt);
}
