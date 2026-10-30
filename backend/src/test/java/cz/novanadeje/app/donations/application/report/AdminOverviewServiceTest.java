package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.report.ActivitySince;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminOverviewServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");
    private static final Optional<SenderAccount> UNKNOWN = Optional.of(new SenderAccount("2900255555", "0800"));

    private final DonorRecordRepository donors = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final AdminOverviewService service = new AdminOverviewService(donors, donations, payments, clock);

    @BeforeEach
    void stubFacts() {
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of(Year.of(2026), Year.of(2025)));
        when(payments.findBookedYearsNewestFirst()).thenReturn(List.of(Year.of(2026)));
        when(donors.countRegisteredBefore(any())).thenAnswer(invocation -> {
            Instant before = invocation.getArgument(0);
            if (!before.isAfter(Instant.parse("2026-08-31T22:00:00Z"))) {
                return 1L;
            }
            return before.isAfter(Instant.parse("2026-09-30T22:00:00Z")) ? 4L : 2L;
        });
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31)))
                .thenReturn(List.of(received(LocalDate.of(2026, 9, 15), 123450), received(LocalDate.of(2026, 10, 2), 50000)));
        when(payments.findUnpairedBookedBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31)))
                .thenReturn(List.of(payment(1004, LocalDate.of(2026, 10, 20), Money.czk(15000), UNKNOWN, "1111111111")));
    }

    @Test
    @DisplayName("Given donations in 2025 and 2026, when no year is asked for, then the current year is compiled from the Prague month boundaries")
    void should_compile_current_year_when_asked_given_no_year() {
        OverviewView view = service.overview(Optional.empty());

        assertThat(view.availableYears()).containsExactly(Year.of(2026), Year.of(2025));
        assertThat(view.year().year()).isEqualTo(Year.of(2026));
        assertThat(view.year().months()).hasSize(10);
        assertThat(view.year().months().getFirst().month()).isEqualTo(ReportMonth.of(2026, 10));
        assertThat(view.year().months().getFirst().paired()).isEqualTo(new Tally(1, Money.czk(50000)));
        assertThat(view.year().months().getFirst().unpaired()).isEqualTo(new Tally(1, Money.czk(15000)));
        assertThat(view.year().months().getFirst().received()).isEqualTo(new Tally(2, Money.czk(65000)));
        assertThat(view.year().months().getFirst().newDonors()).isEqualTo(2);
        assertThat(view.year().months().get(1).newDonors()).isEqualTo(1);
        assertThat(view.year().newDonors()).isEqualTo(3);
        assertThat(view.year().donorsRegistered()).isEqualTo(4);
        verify(donors).countRegisteredBefore(Instant.parse("2025-12-31T23:00:00Z"));
        verify(donors).countRegisteredBefore(Instant.parse("2026-12-31T23:00:00Z"));
    }

    @Test
    @DisplayName("Given donations only in 2025, when the overview is asked for, then the current year is still offered first")
    void should_offer_current_year_when_asked_given_no_donation_this_year() {
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of(Year.of(2025)));

        OverviewView view = service.overview(Optional.empty());

        assertThat(view.availableYears()).containsExactly(Year.of(2026), Year.of(2025));
        assertThat(view.year().year()).isEqualTo(Year.of(2026));
    }

    @Test
    @DisplayName("Given 2025 asked for, when the overview is compiled, then its twelve months are read for that year")
    void should_compile_asked_year_when_asked_given_past_year() {
        when(donations.findReceivedOnBetween(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 12, 31)))
                .thenReturn(List.of(received(LocalDate.of(2025, 3, 1), 20000)));
        when(payments.findUnpairedBookedBetween(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 12, 31))).thenReturn(List.of());

        OverviewView view = service.overview(Optional.of(Year.of(2025)));

        assertThat(view.year().year()).isEqualTo(Year.of(2025));
        assertThat(view.year().months()).hasSize(12);
        assertThat(view.year().paired()).isEqualTo(new Tally(1, Money.czk(20000)));
    }

    @Test
    @DisplayName("Given 2024 with only unpaired payments, when the overview is asked for, then 2024 is offered among the years too")
    void should_offer_year_of_unpaired_payments_when_asked_given_payments_without_donations() {
        when(payments.findBookedYearsNewestFirst()).thenReturn(List.of(Year.of(2026), Year.of(2024)));

        OverviewView view = service.overview(Optional.empty());

        assertThat(view.availableYears()).containsExactly(Year.of(2026), Year.of(2025), Year.of(2024));
    }

    @Test
    @DisplayName("Given three payments imported since the last sign-in, one of them still unpaired, and two new registrations, when the activity since then is asked for, then it counts and sums them")
    void should_count_payments_and_registrations_when_activity_since_asked_given_new_ones() {
        Instant from = Instant.parse("2026-10-22T19:14:00Z");
        when(payments.findImportedSince(from)).thenReturn(List.of(
                payment(1010, LocalDate.of(2026, 10, 22), Money.czk(50000), UNKNOWN, null),
                payment(1011, LocalDate.of(2026, 10, 23), Money.czk(20000), UNKNOWN, null),
                payment(1012, LocalDate.of(2026, 10, 23), Money.czk(15000), UNKNOWN, "1111111111")));
        when(payments.findUnpairedImportedSince(from)).thenReturn(List.of(
                payment(1012, LocalDate.of(2026, 10, 23), Money.czk(15000), UNKNOWN, "1111111111")));
        when(donors.countRegisteredSince(from)).thenReturn(2L);

        ActivitySince activity = service.since(from);

        assertThat(activity.from()).isEqualTo(from);
        assertThat(activity.payments()).isEqualTo(new Tally(3, Money.czk(85000)));
        assertThat(activity.unpaired()).isEqualTo(new Tally(1, Money.czk(15000)));
        assertThat(activity.paired()).isEqualTo(new Tally(2, Money.czk(70000)));
        assertThat(activity.newDonors()).isEqualTo(2);
    }
}
