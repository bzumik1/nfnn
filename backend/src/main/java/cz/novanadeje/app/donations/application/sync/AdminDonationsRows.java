package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.sync.AdminSyncRows.DonationRow;
import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.LinkRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.NextReportRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.PaymentRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.ReportSectionsRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.ReportSettingsRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.ReportSettingsVersionRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.SentReportRow;
import cz.novanadeje.app.donations.application.sync.AdminSyncRows.SymbolClaimRow;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.donations.domain.report.StoredReportSettings;
import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

@Component
public class AdminDonationsRows {

    private final RowVersions versions;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;

    public AdminDonationsRows(RowVersions versions, DonationRepository donations, DonorRecordRepository donorRecords) {
        this.versions = versions;
        this.donations = donations;
        this.donorRecords = donorRecords;
    }

    public PaymentRow unpaidPayment(BankPayment payment) {
        PaymentRow row = unversioned(payment);
        return withVersion(row, versionOf(row, null));
    }

    public PaymentRow paidPayment(BankPayment payment, Donation gift, DonorRecord giver) {
        if (!giver.id().equals(gift.donor())) {
            throw new IllegalArgumentException("The giver " + giver.id().value() + " is not the donor of the gift " + gift.id().value());
        }
        PaymentRow row = giver.isErased() ? withoutPayer(unversioned(payment)) : unversioned(payment);
        return withVersion(row, versionOf(row, DonationRow.from(gift)));
    }

    public PaymentRow currentPayment(BankPayment payment) {
        return donations.findByBankPayment(payment.id())
                .map(gift -> paidPayment(payment, gift, donorRecords.findById(gift.donor()).orElseThrow()))
                .orElseGet(() -> unpaidPayment(payment));
    }

    public LinkRow link(DonorRecord record, SenderAccountLink link) {
        LinkRow row = new LinkRow(link.id().value(), record.id().value(), link.account().display(), link.status(),
                link.provedBy().map(BankPaymentId::value).orElse(null), link.provedAt().orElse(null), link.validFrom().orElse(null),
                link.validTo().orElse(null), link.createdAt(), link.disconnectedAt().orElse(null), null);
        return new LinkRow(row.id(), row.donorId(), row.accountNumber(), row.status(), row.learnedFromPaymentId(), row.learnedAt(), row.validFrom(),
                row.validTo(), row.createdAt(), row.disconnectedAt(), versionOf(row));
    }

    public SymbolClaimRow symbolClaim(SymbolClaim claim) {
        SymbolClaimRow row = new SymbolClaimRow(claim.id().value(), claim.donor().value(), claim.account().display(), claim.symbol().value(),
                claim.answer(), claim.answeredAt(), null);
        return new SymbolClaimRow(row.id(), row.donorId(), row.accountNumber(), row.variableSymbol(), row.answer(), row.answeredAt(), versionOf(row));
    }

    public ReportSettingsRow reportSettings(StoredReportSettings stored, List<SentReport> sent, ReportAdministrationView.NextReport next,
                                            ReportMonth lastEnded) {
        ReportSettings settings = stored.settings();
        return new ReportSettingsRow(settings.recipients().values(), settings.sendDay(), settings.sendHour(), sectionsOf(settings),
                stored.changedAt().orElse(null), sent.stream().map(report -> new SentReportRow(report.month().toString(), report.sentAt())).toList(),
                new NextReportRow(next.month().toString(), next.dueOn()), lastEnded.toString(), reportSettingsVersion(stored));
    }

    public String reportSettingsVersion(StoredReportSettings stored) {
        ReportSettings settings = stored.settings();
        return versionOf(new ReportSettingsVersionRow(settings.recipients().values(), settings.sendDay(), settings.sendHour(), sectionsOf(settings),
                stored.changedAt().orElse(null), List.of(), null));
    }

    private static ReportSectionsRow sectionsOf(ReportSettings settings) {
        return new ReportSectionsRow(settings.sections().donors(), settings.sections().donations(), settings.sections().unpairedPayments(),
                settings.sections().bankImport());
    }

    private String versionOf(Object... rows) {
        return versions.versionOf(Arrays.asList(rows));
    }

    private static PaymentRow unversioned(BankPayment payment) {
        String account = payment.payerAccount().orElse(null);
        return new PaymentRow(payment.id().value(), payment.transactionId().value(), payment.bookedOn(), payment.amount().amountMinor(),
                payment.amount().currency(), payment.variableSymbol().orElse(null), account, payment.counterpartyName().orElse(null),
                payment.messageForRecipient().orElse(null), payment.importedAt(), payment.unpairedByAdminAt().orElse(null),
                DonationPurpose.of(payment) == DonationPurpose.ACCOUNT_VERIFICATION, null);
    }

    private static PaymentRow withoutPayer(PaymentRow row) {
        return new PaymentRow(row.id(), row.bankTransactionId(), row.bookedOn(), row.amountMinor(), row.currency(), row.variableSymbol(), null, null,
                null, row.importedAt(), row.unpairedByAdminAt(), row.accountVerification(), null);
    }

    private static PaymentRow withVersion(PaymentRow row, String version) {
        return new PaymentRow(row.id(), row.bankTransactionId(), row.bookedOn(), row.amountMinor(), row.currency(), row.variableSymbol(),
                row.counterpartyAccount(), row.counterpartyName(), row.messageForRecipient(), row.importedAt(), row.unpairedByAdminAt(),
                row.accountVerification(), version);
    }
}
