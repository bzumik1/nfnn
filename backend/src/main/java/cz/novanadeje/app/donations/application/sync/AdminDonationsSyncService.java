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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

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
        return AdminDonationsSyncSnapshot.withoutAdministration(subject);
    }
}
