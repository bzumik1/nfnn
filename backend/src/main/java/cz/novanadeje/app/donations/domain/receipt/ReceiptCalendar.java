package cz.novanadeje.app.donations.domain.receipt;

import java.time.LocalDate;
import java.time.Year;

public final class ReceiptCalendar {

    private ReceiptCalendar() {
    }

    public static boolean isCompleted(Year year, LocalDate today) {
        return year.getValue() < today.getYear();
    }

    public static Year lastCompleted(LocalDate today) {
        return Year.of(today.getYear() - 1);
    }
}
