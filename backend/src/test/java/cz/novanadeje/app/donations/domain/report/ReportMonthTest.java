package cz.novanadeje.app.donations.domain.report;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportMonthTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);

    @Test
    @DisplayName("Given the first day of October, when the month to report is chosen, then it is September of the same year")
    void should_be_previous_month_when_chosen_given_first_of_october() {
        assertThat(ReportMonth.previousTo(LocalDate.of(2026, 10, 1))).isEqualTo(new ReportMonth(YearMonth.of(2026, 9)));
    }

    @Test
    @DisplayName("Given a day in January, when the month to report is chosen, then it is December of the previous year")
    void should_be_december_of_previous_year_when_chosen_given_january() {
        assertThat(ReportMonth.previousTo(LocalDate.of(2027, 1, 15))).isEqualTo(ReportMonth.of(2026, 12));
    }

    @Test
    @DisplayName("Given September 2026, when its days are asked for, then it runs from the 1st to the 30th and its year from 1 January")
    void should_span_first_to_last_day_when_asked_given_september() {
        assertThat(SEPTEMBER.firstDay()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(SEPTEMBER.lastDay()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(SEPTEMBER.firstDayOfYear()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    @DisplayName("Given September 2026 in summer time, when its instants are asked for, then it starts and ends at Prague midnight, two hours before UTC")
    void should_start_and_end_at_prague_midnight_when_asked_given_summer_month() {
        assertThat(SEPTEMBER.start()).isEqualTo(Instant.parse("2026-08-31T22:00:00Z"));
        assertThat(SEPTEMBER.end()).isEqualTo(Instant.parse("2026-09-30T22:00:00Z"));
    }

    @Test
    @DisplayName("Given October 2026, when its instants are asked for, then it starts in summer time and ends in winter time at Prague midnight")
    void should_follow_the_clock_change_when_asked_given_october() {
        ReportMonth october = ReportMonth.of(2026, 10);

        assertThat(october.start()).isEqualTo(Instant.parse("2026-09-30T22:00:00Z"));
        assertThat(october.end()).isEqualTo(Instant.parse("2026-10-31T23:00:00Z"));
    }

    @Test
    @DisplayName("Given September 2026, when days around it are checked, then only its own days are in the month")
    void should_contain_only_own_days_when_checked_given_september() {
        assertThat(SEPTEMBER.contains(LocalDate.of(2026, 8, 31))).isFalse();
        assertThat(SEPTEMBER.contains(LocalDate.of(2026, 9, 1))).isTrue();
        assertThat(SEPTEMBER.contains(LocalDate.of(2026, 9, 30))).isTrue();
        assertThat(SEPTEMBER.contains(LocalDate.of(2026, 10, 1))).isFalse();
    }

    @Test
    @DisplayName("Given September 2026, when days are checked for the year to date, then 1 January to 30 September count and nothing outside")
    void should_count_from_new_year_to_month_end_when_checked_given_september() {
        assertThat(SEPTEMBER.coversYearToDate(LocalDate.of(2025, 12, 31))).isFalse();
        assertThat(SEPTEMBER.coversYearToDate(LocalDate.of(2026, 1, 1))).isTrue();
        assertThat(SEPTEMBER.coversYearToDate(LocalDate.of(2026, 9, 30))).isTrue();
        assertThat(SEPTEMBER.coversYearToDate(LocalDate.of(2026, 10, 1))).isFalse();
    }

    @Test
    @DisplayName("Given September 2026, when it is checked against the last of September and the first of October, then it is completed only from October")
    void should_be_completed_only_after_its_last_day_when_checked_given_september() {
        assertThat(SEPTEMBER.completedBy(LocalDate.of(2026, 9, 30))).isFalse();
        assertThat(SEPTEMBER.completedBy(LocalDate.of(2026, 10, 1))).isTrue();
    }

    @Test
    @DisplayName("Given no month, when a report month is created, then it is refused")
    void should_refuse_when_created_given_no_month() {
        assertThatThrownBy(() -> new ReportMonth(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
