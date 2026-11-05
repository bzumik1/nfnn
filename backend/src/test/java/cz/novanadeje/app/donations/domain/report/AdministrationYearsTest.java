package cz.novanadeje.app.donations.domain.report;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AdministrationYearsTest {

    @Test
    @DisplayName("Given gifts in 2025 and payments in 2023 and 2025, when the offered years are listed in 2026, then the current year comes first and every year once, newest first")
    void should_offer_current_year_and_every_year_once_when_listed_given_gifts_and_payments() {
        assertThat(AdministrationYears.offeredYears(LocalDate.of(2026, 1, 1), List.of(Year.of(2025)), List.of(Year.of(2025), Year.of(2023))))
                .containsExactly(Year.of(2026), Year.of(2025), Year.of(2023));
    }

    @Test
    @DisplayName("Given a year, when its month starts are listed, then they are Prague midnights from January through the next January")
    void should_list_prague_midnights_through_next_january_when_listed_given_year() {
        List<Instant> starts = AdministrationYears.monthStartsOf(Year.of(2026));

        assertThat(starts).hasSize(YearOverview.MONTH_BOUNDARIES);
        assertThat(starts.getFirst()).isEqualTo(Instant.parse("2025-12-31T23:00:00Z"));
        assertThat(starts.get(3)).isEqualTo(Instant.parse("2026-03-31T22:00:00Z"));
        assertThat(starts.getLast()).isEqualTo(Instant.parse("2026-12-31T23:00:00Z"));
    }
}
