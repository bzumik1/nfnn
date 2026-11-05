package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminPaymentView;
import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.interfaces.rest.AdminPaymentListResponse.AdminPaymentResponse;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

final class AdminSyncRows {

    private AdminSyncRows() {
    }

    record PaymentRow(UUID id, long bankTransactionId, LocalDate bookedOn, long amountMinor, Currency currency, String variableSymbol,
                      String counterpartyAccount, String counterpartyName, String messageForRecipient, Instant importedAt, Instant unpairedByAdminAt,
                      boolean accountVerification) {

        static PaymentRow from(BankPayment payment) {
            AdminPaymentResponse listed = AdminPaymentResponse.from(new AdminPaymentView(payment, Optional.empty()));
            return new PaymentRow(listed.id(), listed.bankTransactionId(), listed.bookedOn(), listed.amountMinor(), listed.currency(),
                    listed.variableSymbol(), listed.counterpartyAccount(), listed.counterpartyName(), listed.messageForRecipient(), listed.importedAt(),
                    listed.unpairedByAdminAt(), listed.accountVerification());
        }
    }

    record DonationRow(UUID id, UUID donorId, UUID paymentId, LocalDate receivedAt, long amountMinor, Currency currency, DonationStatus status,
                       DonationSource source, DonationPurpose purpose, PairingMethod pairedBy, UUID bankAccountId, UUID symbolClaimId,
                       Instant recordedAt) {

        static DonationRow from(Donation donation) {
            return new DonationRow(donation.id().value(), donation.donor().value(), donation.bankPayment().map(BankPaymentId::value).orElse(null),
                    donation.receivedOn(), donation.amount().amountMinor(), donation.amount().currency(), donation.status(), donation.source(),
                    donation.purpose(), donation.pairedBy().orElse(null), donation.pairedThrough().map(SenderAccountLinkId::value).orElse(null),
                    donation.confirmedClaim().map(SymbolClaimId::value).orElse(null), donation.recordedAt());
        }
    }

    record LinkRow(UUID id, UUID donorId, String accountNumber, SenderAccountLinkStatus status, UUID learnedFromPaymentId, Instant learnedAt,
                   LocalDate validFrom, LocalDate validTo, Instant createdAt, Instant disconnectedAt) {

        static LinkRow from(DonorRecord record, SenderAccountLink link) {
            return new LinkRow(link.id().value(), record.id().value(), link.account().display(), link.status(),
                    link.provedBy().map(BankPaymentId::value).orElse(null), link.provedAt().orElse(null), link.validFrom().orElse(null),
                    link.validTo().orElse(null), link.createdAt(), link.disconnectedAt().orElse(null));
        }
    }

    record SymbolClaimRow(UUID id, UUID donorId, String accountNumber, String variableSymbol, SymbolClaimAnswer answer, Instant answeredAt) {

        static SymbolClaimRow from(SymbolClaim claim) {
            return new SymbolClaimRow(claim.id().value(), claim.donor().value(), claim.account().display(), claim.symbol().value(), claim.answer(),
                    claim.answeredAt());
        }
    }

    record ReportSettingsRow(List<String> recipients, int sendDay, int sendHour, AdminReportResponse.Sections sections, Instant changedAt,
                             List<AdminReportResponse.Sent> sentReports) {

        static ReportSettingsRow from(ReportAdministrationView view) {
            AdminReportResponse report = AdminReportResponse.from(view);
            return new ReportSettingsRow(report.settings().recipients(), report.settings().sendDay(), report.settings().sendHour(),
                    report.settings().sections(), report.settings().changedAt(), report.sentReports());
        }
    }
}
