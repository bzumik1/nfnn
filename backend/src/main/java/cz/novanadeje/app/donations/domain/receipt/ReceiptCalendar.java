package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Month;
import java.time.Year;

public final class ReceiptCalendar {

    private static final int FIRST_ANNOUNCING_DAY_OF_JANUARY = 2;

    private ReceiptCalendar() {
    }

    public static boolean isCompleted(Year year, LocalDate today) {
        return year.getValue() < today.getYear();
    }

    public static void requireCompleted(Year year, LocalDate today) {
        if (!isCompleted(year, today)) {
            throw new YearNotYetCompleted(year);
        }
    }

    public static Year lastCompleted(LocalDate today) {
        return Year.of(today.getYear() - 1);
    }

    public static Instant yearStart(Instant at) {
        return Year.from(at.atZone(FoundationCalendar.ZONE)).atDay(1).atStartOfDay(FoundationCalendar.ZONE).toInstant();
    }

    public static boolean announcesYearlyReceiptsOn(LocalDate today) {
        return today.getMonth() == Month.JANUARY && today.getDayOfMonth() >= FIRST_ANNOUNCING_DAY_OF_JANUARY;
    }
}
