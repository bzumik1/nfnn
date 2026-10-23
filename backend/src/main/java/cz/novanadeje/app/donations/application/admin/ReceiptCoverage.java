package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;

import java.util.List;

final class ReceiptCoverage {

    private ReceiptCoverage() {
    }

    static boolean anyReceiptCovers(DonationReceiptRepository receipts, DonorReference donor, List<Donation> donations) {
        if (donations.isEmpty()) {
            return false;
        }
        if (!receipts.findDonationsWithReceipt(donations.stream().map(Donation::id).toList()).isEmpty()) {
            return true;
        }
        return donations.stream().anyMatch(donation -> receipts.existsYearlyIssuedSince(donor, donation.receivedYear(), donation.recordedAt()));
    }
}
