package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.NotFound;

import java.time.Year;

public class YearlyReceiptNotAvailable extends NotFound {

    public static final String CODE = "donations/yearly-receipt-not-available";

    public YearlyReceiptNotAvailable(Year year) {
        super(CODE, "No donation was received in " + year);
    }
}
