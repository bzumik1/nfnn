package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptCalendarTest {

    @Test
    @DisplayName("Given the first of January, when the previous year is checked, then it is completed and the current one is not")
    void should_complete_previous_year_when_checked_given_first_of_january() {
        LocalDate newYear = LocalDate.of(2027, 1, 1);

        assertThat(ReceiptCalendar.isCompleted(Year.of(2026), newYear)).isTrue();
        assertThat(ReceiptCalendar.isCompleted(Year.of(2027), newYear)).isFalse();
    }

    @Test
    @DisplayName("Given New Year's Eve, when the current and a future year are checked, then neither is completed")
    void should_not_complete_current_or_future_year_when_checked_given_new_years_eve() {
        LocalDate eve = LocalDate.of(2026, 12, 31);

        assertThat(ReceiptCalendar.isCompleted(Year.of(2026), eve)).isFalse();
        assertThat(ReceiptCalendar.isCompleted(Year.of(2027), eve)).isFalse();
        assertThat(ReceiptCalendar.isCompleted(Year.of(2019), eve)).isTrue();
    }

    @Test
    @DisplayName("Given a day, when the last completed year is asked, then it is the year before")
    void should_be_previous_year_when_last_completed_asked_given_day() {
        assertThat(ReceiptCalendar.lastCompleted(LocalDate.of(2027, 1, 15))).isEqualTo(Year.of(2026));
        assertThat(ReceiptCalendar.lastCompleted(LocalDate.of(2026, 12, 31))).isEqualTo(Year.of(2025));
    }

    @Test
    @DisplayName("Given the first minutes of a year in Prague, when its start is asked, then it is Prague's midnight of the first of January")
    void should_start_at_pragues_new_year_when_asked_given_the_first_minutes_of_a_year() {
        assertThat(ReceiptCalendar.yearStart(Instant.parse("2026-12-31T23:30:00Z"))).isEqualTo(Instant.parse("2026-12-31T23:00:00Z"));
        assertThat(ReceiptCalendar.yearStart(Instant.parse("2026-12-31T23:00:00Z"))).isEqualTo(Instant.parse("2026-12-31T23:00:00Z"));
    }

    @Test
    @DisplayName("Given the last minute of a year in Prague, when its start is asked, then it is the first of January of that year, not of the year UTC has reached")
    void should_start_at_the_prague_year_when_asked_given_the_last_minute_of_a_year() {
        assertThat(ReceiptCalendar.yearStart(Instant.parse("2026-12-31T22:59:59Z"))).isEqualTo(Instant.parse("2025-12-31T23:00:00Z"));
    }

    @Test
    @DisplayName("Given a summer day, when its year's start is asked, then it is the winter midnight of the first of January in Prague")
    void should_start_at_winter_midnight_when_asked_given_a_summer_day() {
        assertThat(ReceiptCalendar.yearStart(Instant.parse("2026-07-01T12:00:00Z"))).isEqualTo(Instant.parse("2025-12-31T23:00:00Z"));
    }

    @Test
    @DisplayName("Given the first of January, when the yearly receipts announcement is asked, then it is not due yet")
    void should_not_announce_yearly_receipts_when_asked_given_the_first_of_january() {
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2027, 1, 1))).isFalse();
    }

    @Test
    @DisplayName("Given the second and the last of January, when the yearly receipts announcement is asked, then it is due")
    void should_announce_yearly_receipts_when_asked_given_january_from_the_second() {
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2027, 1, 2))).isTrue();
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2027, 1, 31))).isTrue();
    }

    @Test
    @DisplayName("Given a day after January, when the yearly receipts announcement is asked, then it is not due")
    void should_not_announce_yearly_receipts_when_asked_given_a_day_after_january() {
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2027, 2, 1))).isFalse();
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2026, 12, 31))).isFalse();
        assertThat(ReceiptCalendar.announcesYearlyReceiptsOn(LocalDate.of(2027, 2, 2))).isFalse();
    }
}
