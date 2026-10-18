package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donation.YearTotal;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.donation.Donations.JANA;
import static cz.novanadeje.app.donations.domain.donation.Donations.NOW;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorDonationsServiceTest {

    private static final Donation JANUARY_2026 = received(LocalDate.of(2026, 1, 10), 100000);
    private static final Donation DECEMBER_2025 = received(LocalDate.of(2025, 12, 20), 125000);

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorDonationsService service = new DonorDonationsService(donations);

    @Test
    @DisplayName("Given a donor with donations, when listed without a year, then every donation comes in the repository's order with the total")
    void should_list_every_donation_when_listed_given_no_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.empty());

        assertThat(list.items()).containsExactly(JANUARY_2026, DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(225000));
        assertThat(list.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a donor with donations in two years, when listed for one year, then only that year's donations and total come")
    void should_list_only_that_year_when_listed_given_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.of(Year.of(2025)));

        assertThat(list.items()).containsExactly(DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(125000));
        assertThat(list.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a donor with donations, when summarized, then the summary covers every received donation")
    void should_summarize_donations_when_summarized_given_donor_with_donations() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationSummary summary = service.summarizeDonations(JANA);

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

        DonationList list = service.listDonations(stranger, Optional.empty());
        DonationSummary summary = service.summarizeDonations(stranger);

        assertThat(list.items()).isEmpty();
        assertThat(list.total()).isEqualTo(Money.czk(0));
        assertThat(summary.count()).isZero();
        assertThat(summary.lastReceivedOn()).isEmpty();
        assertThat(summary.byYear()).isEmpty();
    }
}
