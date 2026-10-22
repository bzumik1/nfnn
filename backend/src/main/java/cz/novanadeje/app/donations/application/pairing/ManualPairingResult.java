package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.domain.donation.DonationId;

import java.time.Year;
import java.util.List;

public record ManualPairingResult(DonationId donationId, List<Year> changedYearlyReceipts) {

    public ManualPairingResult {
        if (donationId == null || changedYearlyReceipts == null) {
            throw new IllegalArgumentException("A manual pairing result needs the donation and the changed yearly receipts");
        }
        changedYearlyReceipts = List.copyOf(changedYearlyReceipts);
    }
}
