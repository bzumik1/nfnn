package cz.novanadeje.app.donations.application.receipt;

import java.time.Year;

public record ReceiptYears(Year lastCompleted, Year first) {

    public ReceiptYears {
        if (lastCompleted == null || first == null) {
            throw new IllegalArgumentException("The receipt years name the last completed year and the first receipt year");
        }
    }
}
