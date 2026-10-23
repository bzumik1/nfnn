package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static cz.novanadeje.app.donations.domain.donation.Donations.refunded;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YearOverviewTest {

    private static final Year YEAR = Year.of(2026);
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 23);
    private static final Optional<SenderAccount> UNKNOWN = Optional.of(new SenderAccount("2900255555", "0800"));
    private static final List<Long> REGISTRATIONS = List.of(0L, 0L, 1L, 1L, 1L, 1L, 1L, 2L, 2L, 4L, 5L, 5L, 5L);

    @Test
    @DisplayName("Given donations, unpaired payments and registrations through October, when the year is compiled, then the started months come newest first and everything received is paired plus unpaired")
    void should_list_started_months_newest_first_when_compiled_given_year_in_progress() {
        YearOverview overview = YearOverview.compile(YEAR, TODAY,
                List.of(received(LocalDate.of(2026, 9, 1), 123450), received(LocalDate.of(2026, 9, 30), 30000),
                        received(LocalDate.of(2026, 10, 2), 50000), refunded(LocalDate.of(2026, 10, 3), 70000),
                        received(LocalDate.of(2026, 1, 15), 10000)),
                List.of(payment(1004, LocalDate.of(2026, 9, 15), Money.czk(15000), UNKNOWN, "1111111111"),
                        payment(1007, LocalDate.of(2026, 10, 20), Money.czk(20000), UNKNOWN, "2222222222")),
                REGISTRATIONS);

        assertThat(overview.months()).hasSize(10);
        assertThat(overview.months().getFirst()).isEqualTo(new MonthOverview(ReportMonth.of(2026, 10), new Tally(1, Money.czk(50000)), 1,
                new Tally(1, Money.czk(20000))));
        assertThat(overview.months().get(1)).isEqualTo(new MonthOverview(ReportMonth.of(2026, 9), new Tally(2, Money.czk(153450)), 2,
                new Tally(1, Money.czk(15000))));
        assertThat(overview.months().get(1).received()).isEqualTo(new Tally(3, Money.czk(168450)));
        assertThat(overview.months().getLast()).isEqualTo(new MonthOverview(ReportMonth.of(2026, 1), new Tally(1, Money.czk(10000)), 0,
                new Tally(0, Money.czk(0))));
        assertThat(overview.paired()).isEqualTo(new Tally(4, Money.czk(213450)));
        assertThat(overview.unpaired()).isEqualTo(new Tally(2, Money.czk(35000)));
        assertThat(overview.received()).isEqualTo(new Tally(6, Money.czk(248450)));
        assertThat(overview.newDonors()).isEqualTo(5);
        assertThat(overview.donorsRegistered()).isEqualTo(5);
    }

    @Test
    @DisplayName("Given a past year, when it is compiled, then all twelve months are listed and the donors are those registered by its end")
    void should_list_twelve_months_when_compiled_given_past_year() {
        YearOverview overview = YearOverview.compile(Year.of(2025), TODAY, List.of(), List.of(),
                List.of(2L, 2L, 2L, 2L, 2L, 2L, 2L, 2L, 2L, 2L, 2L, 3L, 4L));

        assertThat(overview.months()).hasSize(12);
        assertThat(overview.months().getFirst().month()).isEqualTo(ReportMonth.of(2025, 12));
        assertThat(overview.months().getFirst().newDonors()).isEqualTo(1);
        assertThat(overview.newDonors()).isEqualTo(2);
        assertThat(overview.donorsRegistered()).isEqualTo(4);
        assertThat(overview.received()).isEqualTo(new Tally(0, Money.czk(0)));
    }

    @Test
    @DisplayName("Given a year that has not started, when it is compiled, then it has no months and nothing counted")
    void should_have_no_months_when_compiled_given_future_year() {
        YearOverview overview = YearOverview.compile(Year.of(2027), TODAY, List.of(), List.of(),
                List.of(5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L, 5L));

        assertThat(overview.months()).isEmpty();
        assertThat(overview.newDonors()).isZero();
        assertThat(overview.donorsRegistered()).isEqualTo(5);
    }

    @Test
    @DisplayName("Given twelve donor counts instead of thirteen, when the year is compiled, then it is refused")
    void should_refuse_when_compiled_given_wrong_number_of_donor_counts() {
        assertThatThrownBy(() -> YearOverview.compile(YEAR, TODAY, List.of(), List.of(), List.of(0L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("every month");
    }

    @Test
    @DisplayName("Given a donor count that falls between two months, when the year is compiled, then it is refused")
    void should_refuse_when_compiled_given_falling_donor_counts() {
        assertThatThrownBy(() -> YearOverview.compile(YEAR, TODAY, List.of(), List.of(),
                List.of(2L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L, 1L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot fall");
    }
}
