package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    @DisplayName("Given receipts from 2026, when the yearly receipt of a completed year from 2026 on is required, then it is admitted")
    void should_admit_yearly_receipt_when_required_given_completed_year_from_first_year() {
        assertThatNoException().isThrownBy(() -> FROM_2026.requireYearlyReceiptFor(Year.of(2026), LocalDate.of(2027, 1, 1)));
        assertThatNoException().isThrownBy(() -> FROM_2026.requireYearlyReceiptFor(Year.of(2027), LocalDate.of(2030, 6, 30)));
    }

    @Test
    @DisplayName("Given receipts from 2026, when the yearly receipt of 2026 is required on 31 December 2026, then the year is not completed yet")
    void should_refuse_yearly_receipt_when_required_on_new_years_eve_given_running_year() {
        assertThatThrownBy(() -> FROM_2026.requireYearlyReceiptFor(Year.of(2026), LocalDate.of(2026, 12, 31)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
        assertThatThrownBy(() -> FROM_2026.requireYearlyReceiptFor(Year.of(2030), LocalDate.of(2027, 1, 1))).isInstanceOf(YearNotYetCompleted.class);
    }

    @Test
    @DisplayName("Given receipts from 2026, when the yearly receipt of 2025 is required, then it is before the first receipt year")
    void should_refuse_yearly_receipt_when_required_given_year_before_first_year() {
        assertThatThrownBy(() -> FROM_2026.requireYearlyReceiptFor(Year.of(2025), LocalDate.of(2027, 1, 15)))
                .isInstanceOf(ReceiptBeforeFirstYear.class)
                .extracting("code").isEqualTo("donations/receipt-before-first-year");
    }

    @Test
    @DisplayName("Given receipts from 2028, when the yearly receipt of the running year 2027 is required, then the first receipt year is checked before completion")
    void should_refuse_before_first_year_ahead_of_completion_when_required_given_year_neither_admitted_nor_completed() {
        FirstReceiptYear from2028 = new FirstReceiptYear(Year.of(2028));

        assertThatThrownBy(() -> from2028.requireYearlyReceiptFor(Year.of(2027), LocalDate.of(2027, 6, 1))).isInstanceOf(ReceiptBeforeFirstYear.class);
    }

    @Test
    @DisplayName("Given no year, when the first receipt year is made, then it is refused")
    void should_refuse_when_made_given_no_year() {
        assertThatIllegalArgumentException().isThrownBy(() -> new FirstReceiptYear(null));
    }
}
