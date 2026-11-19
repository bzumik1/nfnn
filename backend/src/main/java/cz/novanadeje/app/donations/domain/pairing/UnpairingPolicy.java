package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationHasReceipt;
import cz.novanadeje.app.donations.domain.donor.ErasedDonorUnpairingInBrowserOnly;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalInBrowserOnly;

import java.util.List;
import java.util.Optional;

public final class UnpairingPolicy {

    private final List<DonationReceipt> receipts;

    public UnpairingPolicy(List<DonationReceipt> donorReceipts) {
        if (donorReceipts == null) {
            throw new IllegalArgumentException("The donor's receipts are required");
        }
        this.receipts = List.copyOf(donorReceipts);
    }

    public Optional<DonationReceipt> decideUnpairing(Donation gift, boolean erasedDonor, boolean connectedApplication) {
        if (connectedApplication && erasedDonor) {
            throw new ErasedDonorUnpairingInBrowserOnly(gift.donor());
        }
        if (hasSingleReceipt(gift)) {
            throw new DonationHasReceipt(gift.id());
        }
        Optional<DonationReceipt> withdrawn = activeYearlyListing(gift);
        if (withdrawn.isPresent() && connectedApplication) {
            throw new ReceiptWithdrawalInBrowserOnly();
        }
        return withdrawn;
    }

    public void requireReversible(SymbolClaimId claim, List<Donation> paired) {
        if (paired.stream().anyMatch(this::coveredSinceRecorded)) {
            throw new SymbolClaimHasReceipt(claim);
        }
    }

    public void requireRemovable(SenderAccountLinkId link, List<Donation> paired) {
        if (paired.stream().anyMatch(this::coveredSinceRecorded)) {
            throw new SenderAccountLinkHasReceipt(link);
        }
    }

    private boolean coveredSinceRecorded(Donation gift) {
        return hasSingleReceipt(gift) || receipts.stream()
                .filter(receipt -> isYearlyOfGiftsYear(receipt, gift))
                .anyMatch(yearly -> !yearly.issuedAt().isBefore(gift.recordedAt()));
    }

    private boolean hasSingleReceipt(Donation gift) {
        return receipts.stream().anyMatch(receipt -> receipt.donation().equals(Optional.of(gift.id())));
    }

    private Optional<DonationReceipt> activeYearlyListing(Donation gift) {
        return receipts.stream()
                .filter(receipt -> isYearlyOfGiftsYear(receipt, gift))
                .filter(DonationReceipt::isActive)
                .filter(yearly -> yearly.lists(gift.id()))
                .findFirst();
    }

    private static boolean isYearlyOfGiftsYear(DonationReceipt receipt, Donation gift) {
        return receipt.kind() == ReceiptKind.YEARLY && receipt.donor().equals(gift.donor()) && receipt.year().equals(Optional.of(gift.receivedYear()));
    }
}
