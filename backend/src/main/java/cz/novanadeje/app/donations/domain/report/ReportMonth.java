package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;

public record ReportMonth(YearMonth value) {

    public ReportMonth {
        if (value == null) {
            throw new IllegalArgumentException("Report month is required");
        }
    }

    public static ReportMonth of(int year, int month) {
        return new ReportMonth(YearMonth.of(year, month));
    }

    public static ReportMonth previousTo(LocalDate today) {
        if (today == null) {
            throw new IllegalArgumentException("Today is required");
        }
        return new ReportMonth(YearMonth.from(today).minusMonths(1));
    }

    public LocalDate firstDay() {
        return value.atDay(1);
    }

    public LocalDate lastDay() {
        return value.atEndOfMonth();
    }

    public LocalDate firstDayOfYear() {
        return LocalDate.of(value.getYear(), 1, 1);
    }

    public Instant start() {
        return firstDay().atStartOfDay(FoundationCalendar.ZONE).toInstant();
    }

    public Instant end() {
        return value.plusMonths(1).atDay(1).atStartOfDay(FoundationCalendar.ZONE).toInstant();
    }

    public boolean contains(LocalDate day) {
        return YearMonth.from(day).equals(value);
    }

    public boolean coversYearToDate(LocalDate day) {
        return !day.isBefore(firstDayOfYear()) && !day.isAfter(lastDay());
    }

    public boolean completedBy(LocalDate today) {
        return today.isAfter(lastDay());
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
