package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.util.Map;
import java.util.Optional;

public record DonationOverview(DonationList list, Map<DonationId, ReceiptNumber> singleReceipts) {

    public DonationOverview {
        if (list == null || singleReceipts == null) {
            throw new IllegalArgumentException("A donation overview needs the list and the single receipts");
        }
        singleReceipts = Map.copyOf(singleReceipts);
    }

    public Optional<ReceiptNumber> receiptNumberOf(Donation donation) {
        if (!donation.isReceived()) {
            return Optional.empty();
        }
        return Optional.ofNullable(singleReceipts.get(donation.id()));
    }
}
