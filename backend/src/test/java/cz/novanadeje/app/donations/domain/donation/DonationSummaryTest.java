package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;

import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static cz.novanadeje.app.donations.domain.donation.Donations.refunded;
import static org.assertj.core.api.Assertions.assertThat;

class DonationSummaryTest {

    @Test
    @DisplayName("Given no donations, when summarized, then the total and count are zero, there is no last donation and no year")
    void should_be_zero_without_years_when_summarized_given_no_donations() {
        DonationSummary summary = DonationSummary.of(List.of());

        assertThat(summary.total()).isEqualTo(Money.czk(0));
        assertThat(summary.count()).isZero();
        assertThat(summary.lastReceivedOn()).isEmpty();
        assertThat(summary.byYear()).isEmpty();
    }

    @Test
    @DisplayName("Given one received donation, when summarized, then it makes the total, the count, the last date and its year's entry")
    void should_summarize_the_donation_when_summarized_given_one_received_donation() {
        DonationSummary summary = DonationSummary.of(List.of(received(LocalDate.of(2026, 3, 15), 50000)));

        assertThat(summary.total()).isEqualTo(Money.czk(50000));
        assertThat(summary.count()).isEqualTo(1);
        assertThat(summary.lastReceivedOn()).contains(LocalDate.of(2026, 3, 15));
        assertThat(summary.byYear()).containsExactly(new YearTotal(Year.of(2026), 1, Money.czk(50000)));
    }

    @Test
    @DisplayName("Given received donations across years in any order, when summarized, then the years come newest first with their own sums")
    void should_sum_per_year_newest_first_when_summarized_given_donations_across_years() {
        DonationSummary summary = DonationSummary.of(List.of(
                received(LocalDate.of(2025, 11, 30), 100000),
                received(LocalDate.of(2026, 3, 15), 50000),
                received(LocalDate.of(2025, 12, 20), 125000),
                received(LocalDate.of(2026, 1, 10), 100000)));

        assertThat(summary.total()).isEqualTo(Money.czk(375000));
        assertThat(summary.count()).isEqualTo(4);
        assertThat(summary.lastReceivedOn()).contains(LocalDate.of(2026, 3, 15));
        assertThat(summary.byYear()).containsExactly(
                new YearTotal(Year.of(2026), 2, Money.czk(150000)),
                new YearTotal(Year.of(2025), 2, Money.czk(225000)));
    }

    @Test
    @DisplayName("Given a refunded donation newer than the received ones, when summarized, then it counts in neither the totals, the last date nor the years")
    void should_ignore_refunded_donation_when_summarized_given_newer_refund() {
        DonationSummary summary = DonationSummary.of(List.of(
                refunded(LocalDate.of(2027, 2, 1), 70000),
                received(LocalDate.of(2026, 3, 15), 50000)));

        assertThat(summary.total()).isEqualTo(Money.czk(50000));
        assertThat(summary.count()).isEqualTo(1);
        assertThat(summary.lastReceivedOn()).contains(LocalDate.of(2026, 3, 15));
        assertThat(summary.byYear()).containsExactly(new YearTotal(Year.of(2026), 1, Money.czk(50000)));
    }

    @Test
    @DisplayName("Given only refunded donations, when summarized, then it is the same as having none")
    void should_be_zero_when_summarized_given_only_refunded_donations() {
        DonationSummary summary = DonationSummary.of(List.of(refunded(LocalDate.of(2026, 3, 15), 50000)));

        assertThat(summary.total()).isEqualTo(Money.czk(0));
        assertThat(summary.count()).isZero();
        assertThat(summary.lastReceivedOn()).isEmpty();
        assertThat(summary.byYear()).isEmpty();
    }
}
