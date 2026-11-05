package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.report.YearOverview;

import java.util.List;
import java.util.Optional;

public record AdminDonationsSyncSnapshot(DonorReference subject, boolean administrator, List<YearOverview> years, List<BankPayment> payments,
                                         List<Donation> donations, List<DonorRecord> donorRecords, List<SymbolClaim> symbolClaims,
                                         List<DonationReceipt> receipts, Optional<BankImportState> importState,
                                         Optional<ReportAdministrationView> report) {

    public AdminDonationsSyncSnapshot {
        if (subject == null || years == null || payments == null || donations == null || donorRecords == null || symbolClaims == null
                || receipts == null || importState == null || report == null) {
            throw new IllegalArgumentException("An administration sync snapshot needs its subject and every list of rows, empty or not");
        }
        if (!administrator && (!years.isEmpty() || !payments.isEmpty() || !donations.isEmpty() || !donorRecords.isEmpty() || !symbolClaims.isEmpty()
                || !receipts.isEmpty() || importState.isPresent() || report.isPresent())) {
            throw new IllegalArgumentException("A snapshot for an account without the administration holds no rows");
        }
        years = List.copyOf(years);
        payments = List.copyOf(payments);
        donations = List.copyOf(donations);
        donorRecords = List.copyOf(donorRecords);
        symbolClaims = List.copyOf(symbolClaims);
        receipts = List.copyOf(receipts);
    }

    public static AdminDonationsSyncSnapshot withoutAdministration(DonorReference subject) {
        return new AdminDonationsSyncSnapshot(subject, false, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), Optional.empty(),
                Optional.empty());
    }
}
