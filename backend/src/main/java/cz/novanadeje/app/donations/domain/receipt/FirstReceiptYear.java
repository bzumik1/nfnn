package cz.novanadeje.app.donations.domain.receipt;

import java.time.LocalDate;
import java.time.Year;

public record FirstReceiptYear(Year year) {

    public FirstReceiptYear {
        if (year == null) {
            throw new IllegalArgumentException("The first receipt year is required");
        }
    }

    public boolean admits(LocalDate receivedOn) {
        return admits(Year.from(receivedOn));
    }

    public boolean admits(Year candidate) {
        return !candidate.isBefore(year);
    }

    @Override
    public String toString() {
        return year.toString();
    }
}
