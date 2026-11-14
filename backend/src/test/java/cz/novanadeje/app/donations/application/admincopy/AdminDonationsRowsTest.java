package cz.novanadeje.app.donations.application.admincopy;

import cz.novanadeje.app.donations.application.admincopy.AdminSyncRows.PaymentRow;
import cz.novanadeje.app.donations.application.admincopy.AdminSyncRows.ReportSettingsRow;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.report.NextReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.donations.domain.report.StoredReportSettings;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminDonationsRowsTest {

    private static final Instant NOW = Instant.parse("2026-11-05T12:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final String PINNED_REPORT_SETTINGS_VERSION = "8c96ea2c6edad06a";

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final AdminDonationsRows rows = new AdminDonationsRows(RowVersionsFixture.canonical(), donations, donorRecords);
    private final BankPayment payment = payment(1001, LocalDate.of(2026, 11, 3), czk(50000), Optional.of(ACCOUNT), "1111111111");

    @Test
    @DisplayName("Given a gift of an erased donor, when its payment's row is made from the gift's donor record or read as the stored payment, then both leave out the payer and carry one version")
    void should_blank_the_payer_and_agree_on_the_version_when_rows_are_made_given_an_erased_donor() {
        DonorRecord erased = jana();
        erased.erase(NOW);
        Donation gift = Donation.fromBankPayment(DonationId.newId(NOW), erased.id(), payment, PairingMethod.VARIABLE_SYMBOL, NOW);
        when(donations.findByBankPayment(payment.id())).thenReturn(Optional.of(gift));
        when(donorRecords.findById(erased.id())).thenReturn(Optional.of(erased));

        PaymentRow fromRecord = rows.paidPayment(payment, gift, erased);
        PaymentRow stored = rows.currentPayment(payment);

        assertThat(fromRecord.counterpartyAccount()).isNull();
        assertThat(fromRecord.counterpartyName()).isNull();
        assertThat(fromRecord.messageForRecipient()).isNull();
        assertThat(stored).isEqualTo(fromRecord);
        assertThat(fromRecord.version()).isNotEqualTo(rows.paidPayment(payment, gift, jana()).version());
    }

    @Test
    @DisplayName("Given a payment without a gift, when its row is made or read as the stored payment, then both keep the payer and carry one version")
    void should_keep_the_payer_and_agree_on_the_version_when_rows_are_made_given_no_gift() {
        when(donations.findByBankPayment(payment.id())).thenReturn(Optional.empty());

        PaymentRow unpaid = rows.unpaidPayment(payment);

        assertThat(unpaid.counterpartyAccount()).isEqualTo(ACCOUNT.display());
        assertThat(rows.currentPayment(payment)).isEqualTo(unpaid);
    }

    @Test
    @DisplayName("Given a gift, when its payment's row is made from another donor's record, then it is refused")
    void should_refuse_when_a_row_is_made_given_another_donors_record() {
        DonorRecord giver = jana();
        Donation gift = Donation.fromBankPayment(DonationId.newId(NOW), giver.id(), payment, PairingMethod.VARIABLE_SYMBOL, NOW);
        DonorRecord other = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), new DonorName("Petr Svoboda"),
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("7310945528"), LocaleCode.CS, NOW);

        assertThatThrownBy(() -> rows.paidPayment(payment, gift, other)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given stored report settings, when their row is made for two months with different next reports and sent reports, then both rows carry the version these settings had before the row named its next report")
    void should_keep_the_version_from_before_the_next_report_when_rows_are_made_given_other_months() {
        StoredReportSettings stored = new StoredReportSettings(new ReportSettings(ReportRecipients.of(new EmailAddress("info@nfnn.cz"),
                new EmailAddress("pokladni@example.cz")), 3, 7, new ReportSections(true, true, false, true)), Optional.of(Instant.parse("2026-10-01T08:00:00Z")));

        ReportSettingsRow october = rows.reportSettings(stored, List.of(), new NextReport(ReportMonth.of(2026, 10),
                LocalDate.of(2026, 11, 3)), ReportMonth.of(2026, 10));
        ReportSettingsRow november = rows.reportSettings(stored, List.of(new SentReport(ReportMonth.of(2026, 10), Instant.parse("2026-11-03T06:00:00Z"))),
                new NextReport(ReportMonth.of(2026, 11), LocalDate.of(2026, 12, 3)), ReportMonth.of(2026, 11));

        assertThat(october.version()).isEqualTo(PINNED_REPORT_SETTINGS_VERSION).isEqualTo(rows.reportSettingsVersion(stored));
        assertThat(november.version()).isEqualTo(PINNED_REPORT_SETTINGS_VERSION);
    }
}
