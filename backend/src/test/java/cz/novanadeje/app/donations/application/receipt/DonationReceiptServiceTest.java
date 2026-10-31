package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptBeforeFirstYear;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyReceiptOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonationReceiptServiceTest {

    private static final DonationId MARCH_2026 = DonationId.newId(NOW);

    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);
    private final DonationReceipt yearly = yearlyReceiptOf(JANA, YEAR_2026);

    @Test
    @DisplayName("Given a donation of the caller, when it is issued, then the issuer freezes it with today's Prague date")
    void should_issue_frozen_receipt_when_issued_given_donation_id() {
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForDonation(JANA, MARCH_2026)).isSameAs(yearly);
    }

    @Test
    @DisplayName("Given a completed year, when its yearly receipt is issued, then the issuer freezes it with today's Prague date")
    void should_issue_frozen_yearly_receipt_when_issued_given_completed_year() {
        when(issuer.issueForYear(JANA, YEAR_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForYear(JANA, YEAR_2026)).isSameAs(yearly);
    }

    @Test
    @DisplayName("Given the current year, when its yearly receipt is issued, then the year is not completed yet and nothing is issued")
    void should_refuse_issuing_when_issued_given_current_year() {
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2027))).isInstanceOf(YearNotYetCompleted.class);
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2025))).isInstanceOf(ReceiptBeforeFirstYear.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given a donation the issuer does not find, when its receipt is issued, then it is not found")
    void should_not_find_donation_when_issued_given_issuer_does_not_find_it() {
        DonationId unknown = DonationId.newId(NOW);
        when(issuer.issueForDonation(JANA, unknown, TODAY)).thenThrow(new DonationNotFound(unknown));

        assertThatThrownBy(() -> service(NOW).issueForDonation(JANA, unknown))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
    }

    @Test
    @DisplayName("Given the current or a future year, when its yearly receipt is issued, then the year is not completed yet and nothing is read")
    void should_refuse_when_issued_given_current_or_future_year() {
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2027)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2030))).isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when the closing year's receipt is asked for, then it is already completed in Prague")
    void should_treat_year_as_completed_when_asked_given_prague_new_year_before_utc() {
        when(issuer.issueForYear(JANA, YEAR_2026, LocalDate.of(2027, 1, 1))).thenReturn(yearly);

        assertThat(service(Instant.parse("2026-12-31T23:30:00Z")).issueForYear(JANA, YEAR_2026)).isSameAs(yearly);
        assertThatThrownBy(() -> service(Instant.parse("2026-12-31T22:30:00Z")).issueForYear(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
    }

    @Test
    @DisplayName("Given receipts from 2026, when the yearly receipt of 2025 is issued, then it is before the first receipt year and nothing is read")
    void should_refuse_when_issued_given_year_before_first_receipt_year() {
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2025)))
                .isInstanceOf(ReceiptBeforeFirstYear.class)
                .extracting("code").isEqualTo("donations/receipt-before-first-year");
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given receipts from 2026 and today in 2026, when the yearly receipt of 2026 is issued, then it is not completed yet")
    void should_still_check_completion_when_issued_given_first_receipt_year_not_completed() {
        assertThatThrownBy(() -> service(Instant.parse("2026-10-22T10:00:00Z")).issueForYear(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given receipts from 2028, when the yearly receipt of the current year 2027 is issued, then the first receipt year is checked before completion")
    void should_refuse_before_first_year_ahead_of_completion_when_issued_given_year_neither_admitted_nor_completed() {
        DonationReceiptService fromLaterYear = new DonationReceiptService(issuer, Clock.fixed(NOW, ZoneOffset.UTC), new FirstReceiptYear(Year.of(2028)));

        assertThatThrownBy(() -> fromLaterYear.issueForYear(JANA, Year.of(2027))).isInstanceOf(ReceiptBeforeFirstYear.class);
        verifyNoInteractions(issuer);
    }

    private DonationReceiptService service(Instant now) {
        return new DonationReceiptService(issuer, Clock.fixed(now, ZoneOffset.UTC), new FirstReceiptYear(YEAR_2026));
    }
}
