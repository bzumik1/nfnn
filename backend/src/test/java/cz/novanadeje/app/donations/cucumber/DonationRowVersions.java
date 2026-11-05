package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.donations.application.admin.AdminDonorAccountsService;
import cz.novanadeje.app.donations.application.admin.AdminDonorView;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.application.sync.AdminDonationsRows;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

@Component
public class DonationRowVersions {

    public static final String MATCHING_NOTHING = "0000000000000000";

    private final BankPaymentRepository payments;
    private final SymbolClaimRepository claims;
    private final AdminDonationsRows rows;
    private final ReportSettingsService reportSettings;
    private final AdminDonorAccountsService donorAccounts;
    private final TransactionTemplate readOnly;

    public DonationRowVersions(BankPaymentRepository payments, SymbolClaimRepository claims, AdminDonationsRows rows,
                               ReportSettingsService reportSettings, AdminDonorAccountsService donorAccounts,
                               PlatformTransactionManager transactions) {
        this.payments = payments;
        this.claims = claims;
        this.rows = rows;
        this.reportSettings = reportSettings;
        this.donorAccounts = donorAccounts;
        this.readOnly = new TransactionTemplate(transactions);
        this.readOnly.setReadOnly(true);
    }

    public String ofPayment(UUID paymentId) {
        return readOnly.execute(status -> payments.findById(new BankPaymentId(paymentId))
                .map(payment -> rows.currentPayment(payment).version())
                .orElse(MATCHING_NOTHING));
    }

    public String ofSymbolClaim(UUID claimId) {
        return readOnly.execute(status -> claims.findById(new SymbolClaimId(claimId))
                .map(claim -> rows.symbolClaim(claim).version())
                .orElse(MATCHING_NOTHING));
    }

    public VersionedLink ofLink(UUID donorId, String account) {
        AdminDonorView view = donorAccounts.view(new DonorReference(donorId));
        return view.bankAccounts().stream().filter(item -> item.link().account().display().equals(account)).findFirst()
                .map(item -> new VersionedLink(item.link().id().value(), view.versionOf(item.link().id())))
                .orElseThrow(() -> new AssertionError("The donor has no bank account " + account));
    }

    public record VersionedLink(UUID id, String version) {
    }

    public String ofReportSettings() {
        return reportSettings.view().settingsVersion();
    }
}
