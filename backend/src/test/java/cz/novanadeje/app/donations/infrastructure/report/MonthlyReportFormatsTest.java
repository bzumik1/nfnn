package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class MonthlyReportFormatsTest {

    @Test
    @DisplayName("Given amounts with and without hellers, when formatted, then they read the Czech way with two decimals and Kč")
    void should_format_czech_amount_when_formatted_given_amounts() {
        assertThat(spaced(MonthlyReportFormats.amount(Money.czk(123450)))).isEqualTo("1 234,50 Kč");
        assertThat(spaced(MonthlyReportFormats.amount(Money.czk(15000)))).isEqualTo("150,00 Kč");
        assertThat(spaced(MonthlyReportFormats.amount(Money.czk(0)))).isEqualTo("0,00 Kč");
        assertThat(spaced(MonthlyReportFormats.amount(Money.czk(123456700)))).isEqualTo("1 234 567,00 Kč");
    }

    @Test
    @DisplayName("Given an amount, when formatted, then its spaces do not break, so Kč never wraps away from the number")
    void should_use_no_break_spaces_when_formatted_given_amount() {
        assertThat(MonthlyReportFormats.amount(Money.czk(123450))).isEqualTo("1 234,50 Kč");
    }

    @Test
    @DisplayName("Given counts, when formatted, then thousands are grouped the Czech way")
    void should_group_thousands_when_formatted_given_counts() {
        assertThat(MonthlyReportFormats.count(2)).isEqualTo("2");
        assertThat(spaced(MonthlyReportFormats.count(12345))).isEqualTo("12 345");
    }

    @Test
    @DisplayName("Given report months, when named, then they are the Czech month in the nominative with the year")
    void should_name_month_in_czech_when_named_given_months() {
        assertThat(MonthlyReportFormats.month(ReportMonth.of(2026, 9))).isEqualTo("září 2026");
        assertThat(MonthlyReportFormats.month(ReportMonth.of(2026, 10))).isEqualTo("říjen 2026");
        assertThat(MonthlyReportFormats.month(ReportMonth.of(2027, 1))).isEqualTo("leden 2027");
    }

    @Test
    @DisplayName("Given a day, when formatted, then it reads day, month and year with dots")
    void should_format_czech_date_when_formatted_given_day() {
        assertThat(MonthlyReportFormats.date(LocalDate.of(2026, 9, 30))).isEqualTo("30. 9. 2026");
    }

    @Test
    @DisplayName("Given an instant in UTC, when formatted, then it reads in Prague time")
    void should_format_prague_time_when_formatted_given_utc_instant() {
        assertThat(MonthlyReportFormats.time(Instant.parse("2026-10-01T10:00:00Z"))).isEqualTo("1. 10. 2026 12:00");
        assertThat(MonthlyReportFormats.time(Instant.parse("2026-12-01T05:30:00Z"))).isEqualTo("1. 12. 2026 6:30");
    }

    private static String spaced(String text) {
        return text.replace(' ', ' ');
    }
}
