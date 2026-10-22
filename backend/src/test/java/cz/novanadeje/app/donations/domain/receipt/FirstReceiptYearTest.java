package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class FirstReceiptYearTest {

    private static final FirstReceiptYear FROM_2026 = new FirstReceiptYear(Year.of(2026));

    @Test
    @DisplayName("Given receipts from 2026, when the days around New Year are checked, then 1 January 2026 is admitted and 31 December 2025 is not")
    void should_admit_from_first_of_january_when_checked_given_first_year() {
        assertThat(FROM_2026.admits(LocalDate.of(2026, 1, 1))).isTrue();
        assertThat(FROM_2026.admits(LocalDate.of(2027, 6, 30))).isTrue();
        assertThat(FROM_2026.admits(LocalDate.of(2025, 12, 31))).isFalse();
    }

    @Test
    @DisplayName("Given receipts from 2026, when years are checked, then 2026 and later are admitted and earlier years are not")
    void should_admit_first_year_and_later_when_checked_given_first_year() {
        assertThat(FROM_2026.admits(Year.of(2026))).isTrue();
        assertThat(FROM_2026.admits(Year.of(2030))).isTrue();
        assertThat(FROM_2026.admits(Year.of(2025))).isFalse();
    }

    @Test
    @DisplayName("Given no year, when the first receipt year is made, then it is refused")
    void should_refuse_when_made_given_no_year() {
        assertThatIllegalArgumentException().isThrownBy(() -> new FirstReceiptYear(null));
    }
}
