package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptBeforeFirstYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPage;
import cz.novanadeje.app.donations.domain.receipt.ReceiptQuery;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.application.receipt.AdministrationChannel.BROWSER;
import static cz.novanadeje.app.donations.application.receipt.AdministrationChannel.CONNECTED_APPLICATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyReceiptOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminReceiptsServiceTest {

    private static final UUID PETR = UUID.fromString("0192f0f1-0000-7000-8000-00000000beef");
    private static final DonationId MARCH_2026 = DonationId.newId(NOW);
    private static final ContentDigest SIGNATURE = new ContentDigest("a".repeat(64));

    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final ReceiptImageRepository images = mock(ReceiptImageRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationReceipt yearly = yearlyReceiptOf(JANA, YEAR_2026);

    @Test
    @DisplayName("Given a donation, when an administrator issues its receipt, then the issuer issues it for the administrator with today's Prague date")
    void should_issue_through_issuer_for_administrator_when_issued_given_donation() {
        when(issuer.issueForDonationByAdministrator(PETR, BROWSER, JANA, MARCH_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForDonation(PETR, BROWSER, JANA, MARCH_2026)).isSameAs(yearly);
    }

    @Test
    @DisplayName("Given a completed year, when an administrator issues its yearly receipt, then the issuer issues it for the administrator, by the Prague calendar on New Year's Eve too")
    void should_issue_yearly_receipt_through_issuer_for_administrator_when_issued_given_completed_year() {
        when(issuer.issueForYearByAdministrator(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenReturn(yearly);
        when(issuer.issueForYearByAdministrator(PETR, BROWSER, JANA, YEAR_2026, LocalDate.of(2027, 1, 1))).thenReturn(yearly);

        assertThat(service(NOW).issueForYear(PETR, BROWSER, JANA, YEAR_2026)).isSameAs(yearly);
        assertThat(service(Instant.parse("2026-12-31T23:30:00Z")).issueForYear(PETR, BROWSER, JANA, YEAR_2026)).isSameAs(yearly);
    }

    @Test
    @DisplayName("Given a year that has not ended or comes before the first receipt year, when an administrator issues its yearly receipt, then it is refused before the issuer is asked")
    void should_refuse_year_before_issuer_when_issued_given_unfinished_or_too_early_year() {
        assertThatThrownBy(() -> service(NOW).issueForYear(PETR, BROWSER, JANA, Year.of(2027))).isInstanceOf(YearNotYetCompleted.class);
        assertThatThrownBy(() -> service(NOW).issueForYear(PETR, BROWSER, JANA, Year.of(2025))).isInstanceOf(ReceiptBeforeFirstYear.class);

        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given a query, when the receipts are listed, then the repository's page comes back as it is")
    void should_return_repository_page_when_listed_given_query() {
        ReceiptQuery query = new ReceiptQuery(Optional.of(JANA), Optional.of(Year.of(2027)), 0, 50);
        ReceiptPage page = new ReceiptPage(List.of(yearly), 1);
        when(receipts.findNewestFirst(query)).thenReturn(page);

        assertThat(service(NOW).receipts(query)).isSameAs(page);
    }

    @Test
    @DisplayName("Given any donor's receipt, when an administrator reads it, then it comes with its donor still on record; an unknown id is not found")
    void should_read_any_donors_receipt_when_read_given_its_id() {
        DonationReceiptId unknown = DonationReceiptId.newId(NOW);
        when(receipts.findById(yearly.id())).thenReturn(Optional.of(yearly));
        when(receipts.findById(unknown)).thenReturn(Optional.empty());
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThat(service(NOW).receipt(yearly.id())).isEqualTo(new AdminReceiptView(yearly, false));
        assertThatThrownBy(() -> service(NOW).receipt(unknown)).isInstanceOf(ReceiptNotFound.class);
    }

    @Test
    @DisplayName("Given a receipt of a donor whose personal data are erased, when an administrator reads it, then it comes as issued and says the donor is erased")
    void should_say_donor_is_erased_when_read_given_erased_donor_record() {
        DonorRecord erased = jana();
        erased.erase(NOW);
        when(receipts.findById(yearly.id())).thenReturn(Optional.of(yearly));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(erased));

        assertThat(service(NOW).receipt(yearly.id())).isEqualTo(new AdminReceiptView(yearly, true));
    }

    @Test
    @DisplayName("Given a connected application, when it issues a receipt, then the issuer is told who asks, so that it can refuse a replacement")
    void should_pass_connected_application_to_issuer_when_issued_given_connected_application() {
        when(issuer.issueForYearByAdministrator(PETR, CONNECTED_APPLICATION, JANA, YEAR_2026, TODAY)).thenReturn(yearly);
        when(issuer.issueForDonationByAdministrator(PETR, CONNECTED_APPLICATION, JANA, MARCH_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForYear(PETR, CONNECTED_APPLICATION, JANA, YEAR_2026)).isSameAs(yearly);
        assertThat(service(NOW).issueForDonation(PETR, CONNECTED_APPLICATION, JANA, MARCH_2026)).isSameAs(yearly);
    }

    @Test
    @DisplayName("Given a signature image, when an administrator fetches it, then it comes only while some receipt names it")
    void should_serve_image_only_when_fetched_given_some_receipt_names_it() {
        StoredReceiptImage image = new StoredReceiptImage(new byte[]{1, 2, 3}, "image/png");
        ContentDigest unnamed = new ContentDigest("b".repeat(64));
        when(receipts.anyShowsSignatureImage(SIGNATURE)).thenReturn(true);
        when(images.find(SIGNATURE)).thenReturn(Optional.of(image));
        when(images.find(unnamed)).thenReturn(Optional.of(image));

        assertThat(service(NOW).signatureImage(SIGNATURE)).isSameAs(image);
        assertThatThrownBy(() -> service(NOW).signatureImage(unnamed)).isInstanceOf(ReceiptImageNotFound.class);
    }

    @Test
    @DisplayName("Given the Prague calendar, when the receipt years are asked, then they name the last completed year and the first receipt year")
    void should_name_last_completed_and_first_year_when_asked_given_prague_calendar() {
        assertThat(service(Instant.parse("2026-12-31T23:30:00Z")).receiptYears()).isEqualTo(new ReceiptYears(Year.of(2026), YEAR_2026));
        assertThat(service(Instant.parse("2026-12-31T22:30:00Z")).receiptYears()).isEqualTo(new ReceiptYears(Year.of(2025), YEAR_2026));
    }

    private AdminReceiptsService service(Instant now) {
        return new AdminReceiptsService(issuer, receipts, images, donorRecords, new FirstReceiptYear(YEAR_2026), Clock.fixed(now, ZoneOffset.UTC));
    }
}
