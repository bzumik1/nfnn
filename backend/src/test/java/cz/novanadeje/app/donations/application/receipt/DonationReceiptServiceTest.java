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

    private static final byte[] PDF = {'%', 'P', 'D', 'F'};
    private static final DonationId MARCH_2026 = DonationId.newId(NOW);

    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);
    private final DonationReceiptRenderer renderer = mock(DonationReceiptRenderer.class);
    private final DonationReceipt yearly = yearlyReceiptOf(JANA, YEAR_2026);

    @Test
    @DisplayName("Given a donation of the caller, when it is issued, then the issuer freezes it with today's Prague date and nothing is rendered")
    void should_issue_frozen_receipt_without_rendering_when_issued_given_donation_id() {
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForDonation(JANA, MARCH_2026)).isSameAs(yearly);
        verifyNoInteractions(renderer);
    }

    @Test
    @DisplayName("Given a completed year, when its yearly receipt is issued, then the issuer freezes it with today's Prague date and nothing is rendered")
    void should_issue_frozen_yearly_receipt_without_rendering_when_issued_given_completed_year() {
        when(issuer.issueForYear(JANA, YEAR_2026, TODAY)).thenReturn(yearly);

        assertThat(service(NOW).issueForYear(JANA, YEAR_2026)).isSameAs(yearly);
        verifyNoInteractions(renderer);
    }

    @Test
    @DisplayName("Given the current year, when its yearly receipt is issued, then the year is not completed yet and nothing is issued")
    void should_refuse_issuing_when_issued_given_current_year() {
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2027))).isInstanceOf(YearNotYetCompleted.class);
        assertThatThrownBy(() -> service(NOW).issueForYear(JANA, Year.of(2025))).isInstanceOf(ReceiptBeforeFirstYear.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given a donation of the caller, when its PDF is asked for, then the issued receipt is rendered from its frozen data")
    void should_render_frozen_receipt_when_pdf_asked_given_donation_id() {
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(yearly);
        when(renderer.render(yearly.frozen(), yearly.issuedAt())).thenReturn(PDF);

        IssuedReceipt pdf = service(NOW).singleReceipt(JANA, MARCH_2026);

        assertThat(pdf.content()).isEqualTo(PDF);
        assertThat(pdf.number()).isEqualTo(FIRST_NUMBER);
        assertThat(pdf.kind()).isEqualTo(ReceiptKind.YEARLY);
        assertThat(pdf.year()).contains(YEAR_2026);
        assertThat(pdf.locale()).isEqualTo(LocaleCode.CS);
    }

    @Test
    @DisplayName("Given a donation the issuer does not find, when its PDF is asked for, then it is not found and the rendering slot is free again")
    void should_not_find_donation_and_free_slot_when_pdf_asked_given_issuer_does_not_find_it() {
        DonationId unknown = DonationId.newId(NOW);
        when(issuer.issueForDonation(JANA, unknown, TODAY)).thenThrow(new DonationNotFound(unknown));
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(yearly);
        when(renderer.render(yearly.frozen(), yearly.issuedAt())).thenReturn(PDF);
        DonationReceiptService service = service(NOW);

        assertThatThrownBy(() -> service.singleReceipt(JANA, unknown))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
        assertThat(service.singleReceipt(JANA, MARCH_2026).content()).isEqualTo(PDF);
    }

    @Test
    @DisplayName("Given a completed year, when its yearly PDF is asked for, then the issued receipt is rendered from its frozen data")
    void should_render_yearly_receipt_when_pdf_asked_given_completed_year() {
        when(issuer.issueForYear(JANA, YEAR_2026, TODAY)).thenReturn(yearly);
        when(renderer.render(yearly.frozen(), yearly.issuedAt())).thenReturn(PDF);

        assertThat(service(NOW).yearlyReceipt(JANA, YEAR_2026).content()).isEqualTo(PDF);
    }

    @Test
    @DisplayName("Given the only rendering slot held by another PDF, when a yearly PDF is asked for, then its receipt is issued before it waits for the slot")
    void should_issue_before_waiting_for_slot_when_pdf_asked_given_slot_held() throws Exception {
        CountDownLatch rendering = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(issuer.issueForDonation(JANA, MARCH_2026, TODAY)).thenReturn(yearly);
        when(issuer.issueForYear(JANA, YEAR_2026, TODAY)).thenReturn(yearly);
        when(renderer.render(yearly.frozen(), yearly.issuedAt())).thenAnswer(call -> {
            rendering.countDown();
            release.await(10, TimeUnit.SECONDS);
            return PDF;
        });
        DonationReceiptService service = service(NOW);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<IssuedReceipt> holding = callers.submit(() -> service.singleReceipt(JANA, MARCH_2026));
            assertThat(rendering.await(10, TimeUnit.SECONDS)).isTrue();
            Future<IssuedReceipt> waiting = callers.submit(() -> service.yearlyReceipt(JANA, YEAR_2026));

            verify(issuer, timeout(10_000)).issueForYear(JANA, YEAR_2026, TODAY);
            assertThat(waiting.isDone()).isFalse();
            release.countDown();
            assertThat(holding.get(10, TimeUnit.SECONDS).content()).isEqualTo(PDF);
            assertThat(waiting.get(10, TimeUnit.SECONDS).content()).isEqualTo(PDF);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    @DisplayName("Given the current or a future year, when its yearly receipt is asked for, then the year is not completed yet and nothing is read")
    void should_refuse_when_asked_given_current_or_future_year() {
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2027)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2030))).isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer, renderer);
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when the closing year's receipt is asked for, then it is already completed in Prague")
    void should_treat_year_as_completed_when_asked_given_prague_new_year_before_utc() {
        when(issuer.issueForYear(JANA, YEAR_2026, LocalDate.of(2027, 1, 1))).thenReturn(yearly);

        assertThat(service(Instant.parse("2026-12-31T23:30:00Z")).issueForYear(JANA, YEAR_2026)).isSameAs(yearly);
        assertThatThrownBy(() -> service(Instant.parse("2026-12-31T22:30:00Z")).yearlyReceipt(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
    }

    @Test
    @DisplayName("Given receipts from 2026, when the yearly receipt of 2025 is asked for, then it is before the first receipt year and nothing is read")
    void should_refuse_when_asked_given_year_before_first_receipt_year() {
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2025)))
                .isInstanceOf(ReceiptBeforeFirstYear.class)
                .extracting("code").isEqualTo("donations/receipt-before-first-year");
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given receipts from 2026 and today in 2026, when the yearly receipt of 2026 is asked for, then it is not completed yet")
    void should_still_check_completion_when_asked_given_first_receipt_year_not_completed() {
        assertThatThrownBy(() -> service(Instant.parse("2026-10-22T10:00:00Z")).yearlyReceipt(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given receipts from 2028, when the yearly receipt of the current year 2027 is asked for, then the first receipt year is checked before completion")
    void should_refuse_before_first_year_ahead_of_completion_when_asked_given_year_neither_admitted_nor_completed() {
        DonationReceiptService fromLaterYear = new DonationReceiptService(issuer, renderer, new ReceiptRenderingLimit(1),
                Clock.fixed(NOW, ZoneOffset.UTC), new FirstReceiptYear(Year.of(2028)));

        assertThatThrownBy(() -> fromLaterYear.yearlyReceipt(JANA, Year.of(2027))).isInstanceOf(ReceiptBeforeFirstYear.class);
        verifyNoInteractions(issuer);
    }

    private DonationReceiptService service(Instant now) {
        return new DonationReceiptService(issuer, renderer, new ReceiptRenderingLimit(1), Clock.fixed(now, ZoneOffset.UTC),
                new FirstReceiptYear(YEAR_2026));
    }
}
