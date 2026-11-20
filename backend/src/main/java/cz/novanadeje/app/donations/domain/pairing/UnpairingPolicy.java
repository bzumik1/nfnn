package cz.novanadeje.app.donations.domain.pairing;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationHasReceipt;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
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
import java.util.stream.Stream;

public final class UnpairingPolicy {

    private final DonorReference donor;
    private final List<DonationReceipt> receipts;

    public UnpairingPolicy(DonorReference donor, List<DonationReceipt> donorReceipts) {
        if (donor == null || donorReceipts == null) {
            throw new IllegalArgumentException("The donor and the donor's receipts are required");
        }
        if (donorReceipts.stream().anyMatch(receipt -> !receipt.donor().equals(donor))) {
            throw new IllegalStateException("Every receipt the policy decides over belongs to its donor");
        }
        this.donor = donor;
        this.receipts = List.copyOf(donorReceipts);
    }

    public Optional<DonationReceipt> decideUnpairing(Donation donation, boolean erasedDonor, boolean connectedApplication) {
        requireOwnDonation(donation);
        if (connectedApplication && erasedDonor) {
            throw new ErasedDonorUnpairingInBrowserOnly(donation.donor());
        }
        if (hasSingleReceipt(donation)) {
            throw new DonationHasReceipt(donation.id());
        }
        Optional<DonationReceipt> withdrawn = activeYearlyListing(donation);
        if (withdrawn.isPresent() && connectedApplication) {
            throw new ReceiptWithdrawalInBrowserOnly();
        }
        return withdrawn;
    }

    public void requireReversible(SymbolClaimId claim, List<Donation> paired) {
        paired.forEach(this::requireOwnDonation);
        if (paired.stream().anyMatch(this::coveredSinceRecorded)) {
            throw new SymbolClaimHasReceipt(claim);
        }
    }

    public void requireRemovable(SenderAccountLinkId link, List<Donation> paired) {
        paired.forEach(this::requireOwnDonation);
        if (paired.stream().anyMatch(this::coveredSinceRecorded)) {
            throw new SenderAccountLinkHasReceipt(link);
        }
    }

    private void requireOwnDonation(Donation donation) {
        if (!donation.donor().equals(donor)) {
            throw new IllegalStateException("The policy decides only over its donor's donations");
        }
    }

    private boolean coveredSinceRecorded(Donation donation) {
        return hasSingleReceipt(donation) || yearliesOfTheYearOf(donation).anyMatch(yearly -> !yearly.issuedAt().isBefore(donation.recordedAt()));
    }

    private boolean hasSingleReceipt(Donation donation) {
        return receipts.stream().anyMatch(receipt -> receipt.donation().equals(Optional.of(donation.id())));
    }

    private Optional<DonationReceipt> activeYearlyListing(Donation donation) {
        return yearliesOfTheYearOf(donation)
                .filter(DonationReceipt::isActive)
                .filter(yearly -> yearly.lists(donation.id()))
                .findFirst();
    }

    private Stream<DonationReceipt> yearliesOfTheYearOf(Donation donation) {
        return receipts.stream()
                .filter(receipt -> receipt.kind() == ReceiptKind.YEARLY)
                .filter(receipt -> receipt.year().equals(Optional.of(donation.receivedYear())));
    }
}
