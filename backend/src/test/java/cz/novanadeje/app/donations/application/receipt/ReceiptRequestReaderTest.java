package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptBeforeFirstYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.VerificationWithoutReceipt;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptNotAvailable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.refundedToJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.verificationFromJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReceiptRequestReaderTest {

    private static final Donation MARCH_2026 = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE_2026 = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);
    private static final Donation REFUNDED_2026 = refundedToJana(LocalDate.of(2026, 4, 1), 20000);
    private static final Donation DECEMBER_2025 = receivedFromJana(LocalDate.of(2025, 12, 20), 100000);
    private static final Donation JANUARY_2027 = receivedFromJana(LocalDate.of(2027, 1, 3), 30000);
    private static final Donation NEW_YEARS_EVE_2025 = receivedFromJana(LocalDate.of(2025, 12, 31), 40000);
    private static final Donation NEW_YEARS_DAY_2026 = receivedFromJana(LocalDate.of(2026, 1, 1), 60000);
    private static final Donation REFUNDED_2025 = refundedToJana(LocalDate.of(2025, 11, 2), 10000);
    private static final Donation VERIFICATION_2026 = verificationFromJana(LocalDate.of(2026, 5, 4));

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final ReceiptRequestReader reader = new ReceiptRequestReader(donations, donorRecords, new FirstReceiptYear(YEAR_2026));

    @Test
    @DisplayName("Given a received donation of the caller, when its receipt request is read, then it carries that donation, the donor record and today")
    void should_read_donation_record_and_today_when_read_given_received_own_donation() {
        when(donations.findByIdForDonor(MARCH_2026.id(), JANA)).thenReturn(Optional.of(MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        ReceiptRequest.ForDonation request = (ReceiptRequest.ForDonation) reader.forDonation(JANA, MARCH_2026.id(), TODAY);

        assertThat(request.donation()).isEqualTo(MARCH_2026);
        assertThat(request.record().id()).isEqualTo(JANA);
        assertThat(request.today()).isEqualTo(TODAY);
        assertThat(request.fingerprint()).isEqualTo(ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH_2026));
    }

    @Test
    @DisplayName("Given a donation that is not the caller's or does not exist, when its receipt request is read, then it is not found")
    void should_not_find_donation_when_read_given_other_donors_or_unknown_id() {
        DonationId foreign = DonationId.newId(NOW);
        when(donations.findByIdForDonor(foreign, JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reader.forDonation(JANA, foreign, TODAY))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
    }

    @Test
    @DisplayName("Given an unknown donation and no donor record, when its receipt request is read, then it is not found rather than broken")
    void should_not_find_donation_when_read_given_unknown_id_and_no_donor_record() {
        DonationId unknown = DonationId.newId(NOW);
        when(donations.findByIdForDonor(unknown, JANA)).thenReturn(Optional.empty());
        when(donorRecords.findById(JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reader.forDonation(JANA, unknown, TODAY)).isInstanceOf(DonationNotFound.class);
    }

    @Test
    @DisplayName("Given a refunded donation of the caller, when its receipt request is read, then no receipt is available")
    void should_refuse_receipt_when_read_given_refunded_donation() {
        when(donations.findByIdForDonor(REFUNDED_2026.id(), JANA)).thenReturn(Optional.of(REFUNDED_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThatThrownBy(() -> reader.forDonation(JANA, REFUNDED_2026.id(), TODAY))
                .isInstanceOf(ReceiptNotAvailable.class)
                .extracting("code").isEqualTo("donations/receipt-not-available");
    }

    @Test
    @DisplayName("Given a payment of the caller that verified an account, when its receipt request is read, then it has no receipt of its own")
    void should_refuse_receipt_when_read_given_account_verification() {
        when(donations.findByIdForDonor(VERIFICATION_2026.id(), JANA)).thenReturn(Optional.of(VERIFICATION_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThatThrownBy(() -> reader.forDonation(JANA, VERIFICATION_2026.id(), TODAY))
                .isInstanceOf(VerificationWithoutReceipt.class)
                .extracting("code").isEqualTo("donations/verification-without-receipt");
    }

    @Test
    @DisplayName("Given a year with a gift and a payment that verified an account, when the yearly receipt request is read, then both are in it")
    void should_read_verification_too_when_read_given_year_with_gift_and_verification() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(VERIFICATION_2026, MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        ReceiptRequest.ForYear request = (ReceiptRequest.ForYear) reader.forYear(JANA, YEAR_2026, TODAY);

        assertThat(request.donations()).containsExactly(MARCH_2026, VERIFICATION_2026);
    }

    @Test
    @DisplayName("Given receipts from 2026 and a donation of the caller received on 31 December 2025, when its receipt request is read, then it is before the first receipt year")
    void should_refuse_receipt_when_read_given_donation_received_before_first_receipt_year() {
        when(donations.findByIdForDonor(NEW_YEARS_EVE_2025.id(), JANA)).thenReturn(Optional.of(NEW_YEARS_EVE_2025));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThatThrownBy(() -> reader.forDonation(JANA, NEW_YEARS_EVE_2025.id(), TODAY))
                .isInstanceOf(ReceiptBeforeFirstYear.class)
                .extracting("code").isEqualTo("donations/receipt-before-first-year");
    }

    @Test
    @DisplayName("Given receipts from 2026 and a donation of the caller received on 1 January 2026, when its receipt request is read, then it carries that donation")
    void should_read_donation_when_read_given_donation_received_on_first_day_of_first_receipt_year() {
        when(donations.findByIdForDonor(NEW_YEARS_DAY_2026.id(), JANA)).thenReturn(Optional.of(NEW_YEARS_DAY_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        ReceiptRequest.ForDonation request = (ReceiptRequest.ForDonation) reader.forDonation(JANA, NEW_YEARS_DAY_2026.id(), TODAY);

        assertThat(request.donation()).isEqualTo(NEW_YEARS_DAY_2026);
    }

    @Test
    @DisplayName("Given receipts from 2026 and a refunded donation of the caller from 2025, when its receipt request is read, then no receipt is available, as for any refunded donation")
    void should_refuse_as_refunded_when_read_given_refunded_donation_before_first_receipt_year() {
        when(donations.findByIdForDonor(REFUNDED_2025.id(), JANA)).thenReturn(Optional.of(REFUNDED_2025));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThatThrownBy(() -> reader.forDonation(JANA, REFUNDED_2025.id(), TODAY)).isInstanceOf(ReceiptNotAvailable.class);
    }

    @Test
    @DisplayName("Given receipts from 2026 and another donor's donation from 2025, when its receipt request is read, then it is not found")
    void should_not_find_donation_when_read_given_other_donors_donation_before_first_receipt_year() {
        when(donations.findByIdForDonor(NEW_YEARS_EVE_2025.id(), JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reader.forDonation(JANA, NEW_YEARS_EVE_2025.id(), TODAY)).isInstanceOf(DonationNotFound.class);
    }

    @Test
    @DisplayName("Given donations but no donor record, when a receipt request is read, then the broken invariant is an illegal state")
    void should_fail_with_illegal_state_when_read_given_missing_donor_record() {
        when(donations.findByIdForDonor(MARCH_2026.id(), JANA)).thenReturn(Optional.of(MARCH_2026));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(MARCH_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.empty());

        assertThatIllegalStateException().isThrownBy(() -> reader.forDonation(JANA, MARCH_2026.id(), TODAY));
        assertThatIllegalStateException().isThrownBy(() -> reader.forYear(JANA, YEAR_2026, TODAY));
    }

    @Test
    @DisplayName("Given donations in three years, when the yearly receipt request is read, then only that year's received ones are in it, oldest first")
    void should_read_that_years_received_donations_oldest_first_when_read_given_donations_in_three_years() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2027, JUNE_2026, REFUNDED_2026, MARCH_2026, DECEMBER_2025));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        ReceiptRequest.ForYear request = (ReceiptRequest.ForYear) reader.forYear(JANA, YEAR_2026, TODAY);

        assertThat(request.year()).isEqualTo(YEAR_2026);
        assertThat(request.donations()).containsExactly(MARCH_2026, JUNE_2026);
        assertThat(request.record().id()).isEqualTo(JANA);
        assertThat(request.today()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("Given a year with only a refunded donation or none, when its yearly receipt request is read, then none is available")
    void should_refuse_when_read_given_year_without_received_donation() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2027, REFUNDED_2026, DECEMBER_2025));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana()));

        assertThatThrownBy(() -> reader.forYear(JANA, YEAR_2026, TODAY))
                .isInstanceOf(YearlyReceiptNotAvailable.class)
                .extracting("code").isEqualTo("donations/yearly-receipt-not-available");
    }

    @Test
    @DisplayName("Given a year without donations and no donor record, when its yearly receipt request is read, then none is available rather than broken")
    void should_refuse_when_read_given_year_without_donations_and_no_donor_record() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());
        when(donorRecords.findById(JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reader.forYear(JANA, YEAR_2026, TODAY)).isInstanceOf(YearlyReceiptNotAvailable.class);
    }
}
