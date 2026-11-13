package cz.novanadeje.app.donations.application.admincopy;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class AdminSyncRows {

    private AdminSyncRows() {
    }

    public record PaymentRow(UUID id, long bankTransactionId, LocalDate bookedOn, long amountMinor, Currency currency, String variableSymbol,
                             String counterpartyAccount, String counterpartyName, String messageForRecipient, Instant importedAt,
                             Instant unpairedByAdminAt, boolean accountVerification, String version) {
    }

    public record DonationRow(UUID id, UUID donorId, UUID paymentId, LocalDate receivedAt, long amountMinor, Currency currency, DonationStatus status,
                              DonationSource source, DonationPurpose purpose, PairingMethod pairedBy, UUID bankAccountId, UUID symbolClaimId,
                              Instant recordedAt) {

        public static DonationRow from(Donation donation) {
            return new DonationRow(donation.id().value(), donation.donor().value(), donation.bankPayment().map(BankPaymentId::value).orElse(null),
                    donation.receivedOn(), donation.amount().amountMinor(), donation.amount().currency(), donation.status(), donation.source(),
                    donation.purpose(), donation.pairedBy().orElse(null), donation.pairedThrough().map(SenderAccountLinkId::value).orElse(null),
                    donation.confirmedClaim().map(SymbolClaimId::value).orElse(null), donation.recordedAt());
        }
    }

    public record PaymentWithGift(PaymentRow payment, DonationRow donation) {
    }

    public record LinkRow(UUID id, UUID donorId, String accountNumber, SenderAccountLinkStatus status, UUID learnedFromPaymentId, Instant learnedAt,
                          LocalDate validFrom, LocalDate validTo, Instant createdAt, Instant disconnectedAt, String version) {
    }

    public record SymbolClaimRow(UUID id, UUID donorId, String accountNumber, String variableSymbol, SymbolClaimAnswer answer, Instant answeredAt,
                                 String version) {
    }

    public record ReportSettingsRow(List<String> recipients, int sendDay, int sendHour, ReportSectionsRow sections, Instant changedAt,
                                    List<SentReportRow> sentReports, NextReportRow nextReport, String lastEndedMonth, String version) {
    }

    public record NextReportRow(String month, LocalDate dueOn) {
    }

    record ReportSettingsVersionRow(List<String> recipients, int sendDay, int sendHour, ReportSectionsRow sections, Instant changedAt,
                                    List<SentReportRow> sentReports, String version) {
    }

    public record ReportSectionsRow(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {
    }

    public record SentReportRow(String month, Instant sentAt) {
    }
}
