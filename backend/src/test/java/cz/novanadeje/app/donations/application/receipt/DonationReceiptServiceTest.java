package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonationReceiptServiceTest {

    private static final byte[] PDF = {'%', 'P', 'D', 'F'};
    private static final DonationId MARCH_2026 = DonationId.newId(NOW);

    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);

    @Test
    @DisplayName("Given a donation of the caller, when its receipt is asked for, then the issuer reads and issues it with today's Prague date")
    void should_issue_for_donation_with_today_when_asked_given_donation_id() {
        IssuedReceipt issued = new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.SINGLE, Optional.empty(), LocaleCode.CS);
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(issued);

        assertThat(service(NOW).singleReceipt(JANA, MARCH_2026)).isEqualTo(issued);
    }

    @Test
    @DisplayName("Given a donation the issuer does not find, when its receipt is asked for, then it is not found and the rendering slot is free again")
    void should_not_find_donation_and_free_slot_when_asked_given_issuer_does_not_find_it() {
        DonationId unknown = DonationId.newId(NOW);
        when(issuer.issueForDonation(JANA, unknown, TODAY)).thenThrow(new DonationNotFound(unknown));
        IssuedReceipt issued = new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.SINGLE, Optional.empty(), LocaleCode.CS);
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(issued);
        DonationReceiptService service = service(NOW);

        assertThatThrownBy(() -> service.singleReceipt(JANA, unknown))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
        assertThat(service.singleReceipt(JANA, MARCH_2026)).isEqualTo(issued);
    }

    @Test
    @DisplayName("Given a completed year, when its yearly receipt is asked for, then the issuer reads and issues it with today's Prague date")
    void should_issue_for_year_with_today_when_asked_given_completed_year() {
        IssuedReceipt issued = new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.YEARLY, Optional.of(YEAR_2026), LocaleCode.CS);
        when(issuer.issueForYear(JANA, YEAR_2026, TODAY)).thenReturn(issued);

        assertThat(service(NOW).yearlyReceipt(JANA, YEAR_2026)).isEqualTo(issued);
    }

    @Test
    @DisplayName("Given the current or a future year, when its yearly receipt is asked for, then the year is not completed yet and nothing is read")
    void should_refuse_when_asked_given_current_or_future_year() {
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2027)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2030))).isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when the closing year's receipt is asked for, then it is already completed in Prague")
    void should_treat_year_as_completed_when_asked_given_prague_new_year_before_utc() {
        IssuedReceipt issued = new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.YEARLY, Optional.of(YEAR_2026), LocaleCode.CS);
        when(issuer.issueForYear(JANA, YEAR_2026, LocalDate.of(2027, 1, 1))).thenReturn(issued);

        assertThat(service(Instant.parse("2026-12-31T23:30:00Z")).yearlyReceipt(JANA, YEAR_2026)).isEqualTo(issued);
        assertThatThrownBy(() -> service(Instant.parse("2026-12-31T22:30:00Z")).yearlyReceipt(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
    }

    private DonationReceiptService service(Instant now) {
        return new DonationReceiptService(issuer, new ReceiptRenderingLimit(1), Clock.fixed(now, ZoneOffset.UTC));
    }
}
