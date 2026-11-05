package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.application.overview.DonationSummaryView;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public record DonorSyncSnapshot(DonorReference donor, List<Donation> donations, DonationSummaryView summary, List<DonationReceipt> receipts,
                                List<BankAccountView> bankAccounts, List<SymbolClaim> symbolClaims, Optional<Instant> bankDataAsOf) {

    public DonorSyncSnapshot {
        if (donor == null || donations == null || summary == null || receipts == null || bankAccounts == null || symbolClaims == null
                || bankDataAsOf == null) {
            throw new IllegalArgumentException("A sync snapshot needs the donor, the donations, the summary, the receipts, the bank accounts, "
                    + "the symbol claims and the bank data time");
        }
        donations = List.copyOf(donations);
        receipts = List.copyOf(receipts);
        bankAccounts = List.copyOf(bankAccounts);
        symbolClaims = List.copyOf(symbolClaims);
    }
}
