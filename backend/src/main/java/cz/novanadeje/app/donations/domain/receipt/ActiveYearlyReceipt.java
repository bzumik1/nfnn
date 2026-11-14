package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Instant;

public record ActiveYearlyReceipt(DonorReference donor, DonationReceiptId id, ReceiptNumber number, Instant issuedAt) {

    public ActiveYearlyReceipt {
        if (donor == null || id == null || number == null || issuedAt == null) {
            throw new IllegalArgumentException("An active yearly receipt names its donor, id, number and issue time");
        }
    }
}
