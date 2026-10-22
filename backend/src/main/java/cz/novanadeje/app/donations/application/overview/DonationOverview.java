package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Map;
import java.util.Optional;

public record DonationOverview(DonationList list, Map<DonationId, ReceiptNumber> singleReceipts,
                               Map<SenderAccountLinkId, SenderAccount> linkedAccounts, Map<SymbolClaimId, VariableSymbol> claimedSymbols,
                               FirstReceiptYear firstReceiptYear) {

    public DonationOverview {
        if (list == null || singleReceipts == null || linkedAccounts == null || claimedSymbols == null || firstReceiptYear == null) {
            throw new IllegalArgumentException(
                    "A donation overview needs the list, the single receipts, the linked accounts, the claimed symbols and the first receipt year");
        }
        singleReceipts = Map.copyOf(singleReceipts);
        linkedAccounts = Map.copyOf(linkedAccounts);
        claimedSymbols = Map.copyOf(claimedSymbols);
    }

    public Optional<ReceiptNumber> receiptNumberOf(Donation donation) {
        if (!donation.isReceived()) {
            return Optional.empty();
        }
        return Optional.ofNullable(singleReceipts.get(donation.id()));
    }

    public boolean receiptAvailable(Donation donation) {
        return donation.isReceived() && firstReceiptYear.admits(donation.receivedOn());
    }

    public Optional<SenderAccount> senderAccountOf(Donation donation) {
        return donation.pairedThrough().map(linkedAccounts::get);
    }

    public Optional<VariableSymbol> confirmedSymbolOf(Donation donation) {
        return donation.confirmedClaim().map(claimedSymbols::get);
    }
}
