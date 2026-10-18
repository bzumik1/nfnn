package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.util.Map;
import java.util.Optional;

public record DonationOverview(DonationList list, Map<DonationId, ReceiptNumber> singleReceipts,
                               Map<SenderAccountLinkId, SenderAccount> linkedAccounts) {

    public DonationOverview {
        if (list == null || singleReceipts == null || linkedAccounts == null) {
            throw new IllegalArgumentException("A donation overview needs the list, the single receipts and the linked accounts");
        }
        singleReceipts = Map.copyOf(singleReceipts);
        linkedAccounts = Map.copyOf(linkedAccounts);
    }

    public DonationOverview(DonationList list, Map<DonationId, ReceiptNumber> singleReceipts) {
        this(list, singleReceipts, Map.of());
    }

    public Optional<ReceiptNumber> receiptNumberOf(Donation donation) {
        if (!donation.isReceived()) {
            return Optional.empty();
        }
        return Optional.ofNullable(singleReceipts.get(donation.id()));
    }

    public Optional<SenderAccount> senderAccountOf(Donation donation) {
        return donation.pairedThrough().map(linkedAccounts::get);
    }
}
