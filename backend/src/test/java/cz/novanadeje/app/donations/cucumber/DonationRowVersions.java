package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.donations.application.admin.AdminDonorAccountsService;
import cz.novanadeje.app.donations.application.admin.AdminDonorView;
import cz.novanadeje.app.donations.application.admin.AdminPaymentView;
import cz.novanadeje.app.donations.application.admin.AdminPaymentsService;
import cz.novanadeje.app.donations.application.admin.AdminSymbolClaimsService;
import cz.novanadeje.app.donations.application.admin.PaymentFilter;
import cz.novanadeje.app.donations.application.admin.SymbolClaimView;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

@Component
public class DonationRowVersions {

    public static final String MATCHING_NOTHING = "0000000000000000";

    private final AdminPaymentsService paymentList;
    private final AdminSymbolClaimsService symbolClaimList;
    private final ReportSettingsService reportSettings;
    private final AdminDonorAccountsService donorAccounts;

    public DonationRowVersions(AdminPaymentsService paymentList, AdminSymbolClaimsService symbolClaimList, ReportSettingsService reportSettings,
                               AdminDonorAccountsService donorAccounts) {
        this.paymentList = paymentList;
        this.symbolClaimList = symbolClaimList;
        this.reportSettings = reportSettings;
        this.donorAccounts = donorAccounts;
    }

    public String ofPayment(UUID paymentId) {
        BankPaymentId id = new BankPaymentId(paymentId);
        return Stream.concat(paymentList.listUnpaired(PaymentFilter.none()).items().stream(),
                        paymentList.listPaired(Optional.empty(), PaymentFilter.none()).items().stream())
                .filter(view -> view.payment().id().equals(id))
                .map(AdminPaymentView::version)
                .findFirst()
                .orElse(MATCHING_NOTHING);
    }

    public String ofSymbolClaim(UUID claimId) {
        SymbolClaimId id = new SymbolClaimId(claimId);
        return symbolClaimList.list().stream()
                .filter(view -> view.claim().id().equals(id))
                .map(SymbolClaimView::version)
                .findFirst()
                .orElse(MATCHING_NOTHING);
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
