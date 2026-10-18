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

class DonationListTest {

    private static final Donation MARCH_2026 = received(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JANUARY_2026 = received(LocalDate.of(2026, 1, 10), 100000);
    private static final Donation DECEMBER_2025 = received(LocalDate.of(2025, 12, 20), 125000);
    private static final Donation NOVEMBER_2025 = received(LocalDate.of(2025, 11, 30), 100000);

    @Test
    @DisplayName("Given no donations, when listed, then the list is empty with a zero CZK total and a zero count")
    void should_be_empty_with_zero_total_when_listed_given_no_donations() {
        DonationList list = DonationList.of(List.of());

        assertThat(list.items()).isEmpty();
        assertThat(list.total()).isEqualTo(Money.czk(0));
        assertThat(list.count()).isZero();
    }

    @Test
    @DisplayName("Given one received donation, when listed, then it is the only item and its amount is the total")
    void should_total_the_donation_when_listed_given_one_received_donation() {
        DonationList list = DonationList.of(List.of(MARCH_2026));

        assertThat(list.items()).containsExactly(MARCH_2026);
        assertThat(list.total()).isEqualTo(Money.czk(50000));
        assertThat(list.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given received donations across years, when listed, then they keep their order and add up to the total")
    void should_keep_order_and_add_up_when_listed_given_donations_across_years() {
        DonationList list = DonationList.of(List.of(MARCH_2026, JANUARY_2026, DECEMBER_2025, NOVEMBER_2025));

        assertThat(list.items()).containsExactly(MARCH_2026, JANUARY_2026, DECEMBER_2025, NOVEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(375000));
        assertThat(list.count()).isEqualTo(4);
    }

    @Test
    @DisplayName("Given a refunded donation among received ones, when listed, then it stays in the items but outside the total and the count")
    void should_list_refunded_but_not_count_it_when_listed_given_refunded_donation() {
        Donation refundedInFebruary = refunded(LocalDate.of(2026, 2, 1), 70000);

        DonationList list = DonationList.of(List.of(MARCH_2026, refundedInFebruary, JANUARY_2026));

        assertThat(list.items()).containsExactly(MARCH_2026, refundedInFebruary, JANUARY_2026);
        assertThat(list.total()).isEqualTo(Money.czk(150000));
        assertThat(list.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given donations across years, when narrowed to one year, then only that year's donations remain with their own total and count")
    void should_keep_only_that_year_when_narrowed_given_donations_across_years() {
        Donation refundedIn2025 = refunded(LocalDate.of(2025, 12, 1), 70000);
        DonationList list = DonationList.of(List.of(MARCH_2026, JANUARY_2026, DECEMBER_2025, refundedIn2025, NOVEMBER_2025));

        DonationList in2025 = list.inYear(Year.of(2025));

        assertThat(in2025.items()).containsExactly(DECEMBER_2025, refundedIn2025, NOVEMBER_2025);
        assertThat(in2025.total()).isEqualTo(Money.czk(225000));
        assertThat(in2025.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given donations, when narrowed to a year with none, then the list is empty with a zero total")
    void should_be_empty_when_narrowed_given_year_without_donations() {
        DonationList in2024 = DonationList.of(List.of(MARCH_2026, DECEMBER_2025)).inYear(Year.of(2024));

        assertThat(in2024.items()).isEmpty();
        assertThat(in2024.total()).isEqualTo(Money.czk(0));
        assertThat(in2024.count()).isZero();
    }
}
