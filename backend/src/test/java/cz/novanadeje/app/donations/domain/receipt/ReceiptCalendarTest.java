package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
}
