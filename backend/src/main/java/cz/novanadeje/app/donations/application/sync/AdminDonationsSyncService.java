package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.report.AdminOverviewService;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.Donation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AdminDonationsSyncService {

    private final AdministrationHolders administrationHolders;
    private final AdminOverviewService overview;
    private final BankPaymentRepository payments;
    private final DonationRepository donations;
    private final DonorRecordRepository records;
    private final SymbolClaimRepository claims;
    private final DonationReceiptRepository receipts;
    private final BankImportStateRepository importStates;
    private final ReportSettingsService reportSettings;

    public AdminDonationsSyncService(AdministrationHolders administrationHolders, AdminOverviewService overview, BankPaymentRepository payments,
                                     DonationRepository donations, DonorRecordRepository records, SymbolClaimRepository claims,
                                     DonationReceiptRepository receipts, BankImportStateRepository importStates, ReportSettingsService reportSettings) {
        this.administrationHolders = administrationHolders;
        this.overview = overview;
        this.payments = payments;
        this.donations = donations;
        this.records = records;
        this.claims = claims;
        this.receipts = receipts;
        this.importStates = importStates;
        this.reportSettings = reportSettings;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminDonationsSyncSnapshot snapshotFor(DonorReference subject) {
        if (!administrationHolders.holdsAdministration(subject.value())) {
            return AdminDonationsSyncSnapshot.withoutAdministration(subject);
        }
        List<DonorRecord> donorRecords = records.findAll();
        Set<DonorReference> erased = donorRecords.stream().filter(DonorRecord::isErased).map(DonorRecord::id).collect(Collectors.toSet());
        List<BankPayment> booked = payments.findAllNewestFirst();
        List<Donation> received = donations.findAllNewestFirst();
        List<DonationReceipt> kept = receipts.findAllNewestFirst().stream().filter(receipt -> !erased.contains(receipt.donor())).toList();
        return new AdminDonationsSyncSnapshot(subject, true, overview.everyOfferedYear(received, booked, donorRecords), booked, received, donorRecords,
                claims.findAllNewestFirst(), kept, Optional.of(importStates.current()), Optional.of(reportSettings.view()));
    }
}
