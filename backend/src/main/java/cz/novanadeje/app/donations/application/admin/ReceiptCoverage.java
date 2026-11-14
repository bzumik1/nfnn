package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ReceiptCoverage {

    private final DonationReceiptRepository receipts;

    public ReceiptCoverage(DonationReceiptRepository receipts) {
        this.receipts = receipts;
    }

    boolean anyReceiptCovers(DonorReference donor, List<Donation> donations) {
        if (donations.isEmpty()) {
            return false;
        }
        if (!receipts.findDonationsWithReceipt(donations.stream().map(Donation::id).toList()).isEmpty()) {
            return true;
        }
        return donations.stream().anyMatch(donation -> receipts.existsYearlyIssuedSince(donor, donation.receivedYear(), donation.recordedAt()));
    }
}
