package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donation.YearTotal;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.donation.Donations.JANA;
import static cz.novanadeje.app.donations.domain.donation.Donations.NOW;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static cz.novanadeje.app.donations.domain.donation.Donations.refunded;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorDonationsServiceTest {

    private static final Donation JANUARY_2026 = received(LocalDate.of(2026, 1, 10), 100000);
    private static final Donation DECEMBER_2025 = received(LocalDate.of(2025, 12, 20), 125000);

    private static final Donation REFUNDED_2026 = refunded(LocalDate.of(2026, 2, 1), 30000);
    private static final ReceiptNumber FIRST_RECEIPT = new ReceiptNumber("2026-000001");

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final DonorDonationsService service = new DonorDonationsService(donations, receipts,
            Clock.fixed(Instant.parse("2026-10-17T11:00:00Z"), ZoneOffset.UTC));

    @Test
    @DisplayName("Given a donor with donations, when listed without a year, then every donation comes in the repository's order with the total")
    void should_list_every_donation_when_listed_given_no_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.empty()).list();

        assertThat(list.items()).containsExactly(JANUARY_2026, DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(225000));
        assertThat(list.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a donor with donations in two years, when listed for one year, then only that year's donations and total come")
    void should_list_only_that_year_when_listed_given_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.of(Year.of(2025))).list();

        assertThat(list.items()).containsExactly(DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(125000));
        assertThat(list.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a donor with donations, when summarized, then the summary covers every received donation")
    void should_summarize_donations_when_summarized_given_donor_with_donations() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationSummary summary = service.summarizeDonations(JANA).summary();

        assertThat(summary.total()).isEqualTo(Money.czk(225000));
        assertThat(summary.count()).isEqualTo(2);
        assertThat(summary.lastReceivedOn()).contains(LocalDate.of(2026, 1, 10));
        assertThat(summary.byYear()).containsExactly(
                new YearTotal(Year.of(2026), 1, Money.czk(100000)),
                new YearTotal(Year.of(2025), 1, Money.czk(125000)));
    }

    @Test
    @DisplayName("Given a donor donations knows nothing about, when listed and summarized, then both are empty instead of failing")
    void should_be_empty_when_listed_and_summarized_given_unknown_donor() {
        DonorReference stranger = new DonorReference(UuidV7.generate(NOW));
        when(donations.findByDonorNewestFirst(stranger)).thenReturn(List.of());

        DonationOverview overview = service.listDonations(stranger, Optional.empty());
        DonationList list = overview.list();
        DonationSummary summary = service.summarizeDonations(stranger).summary();

        assertThat(list.items()).isEmpty();
        assertThat(list.total()).isEqualTo(Money.czk(0));
        assertThat(summary.count()).isZero();
        assertThat(summary.lastReceivedOn()).isEmpty();
        assertThat(summary.byYear()).isEmpty();
        assertThat(overview.singleReceipts()).isEmpty();
    }

    @Test
    @DisplayName("Given active single receipts of the donor, when listed, then each received donation carries its receipt number and the others none")
    void should_carry_receipt_numbers_when_listed_given_active_single_receipts() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));
        when(receipts.findActiveSingleNumbersFor(JANA)).thenReturn(Map.of(DECEMBER_2025.id(), FIRST_RECEIPT));

        DonationOverview overview = service.listDonations(JANA, Optional.empty());

        assertThat(overview.receiptNumberOf(DECEMBER_2025)).contains(FIRST_RECEIPT);
        assertThat(overview.receiptNumberOf(JANUARY_2026)).isEmpty();
    }

    @Test
    @DisplayName("Given a refunded donation that once got a receipt, when listed, then it carries no receipt number")
    void should_carry_no_receipt_number_when_listed_given_refunded_donation_with_receipt() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(REFUNDED_2026));
        when(receipts.findActiveSingleNumbersFor(JANA)).thenReturn(Map.of(REFUNDED_2026.id(), FIRST_RECEIPT));

        assertThat(service.listDonations(JANA, Optional.empty()).receiptNumberOf(REFUNDED_2026)).isEmpty();
    }

    @Test
    @DisplayName("Given today is in 2026 in Prague, when summarized, then yearly receipts are available through 2025")
    void should_name_last_completed_year_when_summarized_given_clock_in_2026() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(service.summarizeDonations(JANA).lastCompletedYear()).isEqualTo(Year.of(2025));
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when summarized, then the closing year already counts as completed in Prague")
    void should_count_closing_year_as_completed_when_summarized_given_prague_new_year() {
        DonorDonationsService atNewYear = new DonorDonationsService(donations, receipts,
                Clock.fixed(Instant.parse("2026-12-31T23:30:00Z"), ZoneOffset.UTC));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(atNewYear.summarizeDonations(JANA).lastCompletedYear()).isEqualTo(Year.of(2026));
    }
}
