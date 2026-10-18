package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptNotAvailable;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.refundedToJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonationReceiptServiceTest {

    private static final byte[] PDF = {'%', 'P', 'D', 'F'};
    private static final Donation MARCH_2026 = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE_2026 = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);
    private static final Donation REFUNDED_2026 = refundedToJana(LocalDate.of(2026, 4, 1), 20000);
    private static final Donation DECEMBER_2025 = receivedFromJana(LocalDate.of(2025, 12, 20), 100000);
    private static final Donation JANUARY_2027 = receivedFromJana(LocalDate.of(2027, 1, 3), 30000);

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);

    @Test
    @DisplayName("Given a received donation of the caller, when its receipt is asked for, then the issuer gets that donation with today's Prague date")
    void should_issue_for_donation_with_today_when_asked_given_received_own_donation() {
        when(donations.findByIdForDonor(MARCH_2026.id(), JANA)).thenReturn(Optional.of(MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));
        IssuedReceipt issued = new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.SINGLE, Optional.empty(), LocaleCode.CS);
        when(issuer.issue(any())).thenReturn(issued);

        assertThat(service(NOW).singleReceipt(JANA, MARCH_2026.id())).isEqualTo(issued);

        ReceiptRequest.ForDonation request = (ReceiptRequest.ForDonation) issuedRequest();
        assertThat(request.donation()).isEqualTo(MARCH_2026);
        assertThat(request.record().id()).isEqualTo(JANA);
        assertThat(request.today()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("Given a donation that is not the caller's or does not exist, when its receipt is asked for, then it is not found")
    void should_not_find_donation_when_asked_given_other_donors_or_unknown_id() {
        DonationId foreign = DonationId.newId(NOW);
        when(donations.findByIdForDonor(foreign, JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service(NOW).singleReceipt(JANA, foreign))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given a refunded donation of the caller, when its receipt is asked for, then no receipt is available")
    void should_refuse_receipt_when_asked_given_refunded_donation() {
        when(donations.findByIdForDonor(REFUNDED_2026.id(), JANA)).thenReturn(Optional.of(REFUNDED_2026));

        assertThatThrownBy(() -> service(NOW).singleReceipt(JANA, REFUNDED_2026.id()))
                .isInstanceOf(ReceiptNotAvailable.class)
                .extracting("code").isEqualTo("donations/receipt-not-available");
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given donations but no donor record, when a receipt is asked for, then the broken invariant is an illegal state")
    void should_fail_with_illegal_state_when_asked_given_missing_donor_record() {
        when(donations.findByIdForDonor(MARCH_2026.id(), JANA)).thenReturn(Optional.of(MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.empty());

        assertThatIllegalStateException().isThrownBy(() -> service(NOW).singleReceipt(JANA, MARCH_2026.id()));
        verifyNoInteractions(issuer);
    }

    @Test
    @DisplayName("Given donations in three years, when the yearly receipt of a completed year is asked for, then only that year's received ones go to the issuer, oldest first")
    void should_issue_with_that_years_received_donations_oldest_first_when_asked_given_completed_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2027, JUNE_2026, REFUNDED_2026, MARCH_2026, DECEMBER_2025));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));
        when(issuer.issue(any())).thenReturn(new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.YEARLY, Optional.of(YEAR_2026), LocaleCode.CS));

        service(NOW).yearlyReceipt(JANA, YEAR_2026);

        ReceiptRequest.ForYear request = (ReceiptRequest.ForYear) issuedRequest();
        assertThat(request.year()).isEqualTo(YEAR_2026);
        assertThat(request.donations()).containsExactly(MARCH_2026, JUNE_2026);
        assertThat(request.today()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("Given the current or a future year, when its yearly receipt is asked for, then the year is not completed yet")
    void should_refuse_when_asked_given_current_or_future_year() {
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2027)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, Year.of(2030))).isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer, donations);
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when the closing year's receipt is asked for, then it is already completed in Prague")
    void should_treat_year_as_completed_when_asked_given_prague_new_year_before_utc() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));
        when(issuer.issue(any())).thenReturn(new IssuedReceipt(PDF, FIRST_NUMBER, ReceiptKind.YEARLY, Optional.of(YEAR_2026), LocaleCode.CS));

        service(Instant.parse("2026-12-31T23:30:00Z")).yearlyReceipt(JANA, YEAR_2026);

        assertThat(issuedRequest().today()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThatThrownBy(() -> service(Instant.parse("2026-12-31T22:30:00Z")).yearlyReceipt(JANA, YEAR_2026))
                .isInstanceOf(YearNotYetCompleted.class);
    }

    @Test
    @DisplayName("Given a completed year with only a refunded donation or none, when its yearly receipt is asked for, then none is available")
    void should_refuse_when_asked_given_year_without_received_donation() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2027, REFUNDED_2026, DECEMBER_2025));

        assertThatThrownBy(() -> service(NOW).yearlyReceipt(JANA, YEAR_2026))
                .isInstanceOf(YearlyReceiptNotAvailable.class)
                .extracting("code").isEqualTo("donations/yearly-receipt-not-available");
        verifyNoInteractions(issuer);
    }

    private DonationReceiptService service(Instant now) {
        return new DonationReceiptService(donations, donorRecords, issuer, Clock.fixed(now, ZoneOffset.UTC));
    }

    private ReceiptRequest issuedRequest() {
        ArgumentCaptor<ReceiptRequest> request = ArgumentCaptor.forClass(ReceiptRequest.class);
        verify(issuer).issue(request.capture());
        return request.getValue();
    }
}
