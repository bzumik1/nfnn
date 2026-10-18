package cz.novanadeje.app.donations.domain.receipt;

import java.time.Year;
import java.util.regex.Pattern;

public record ReceiptNumber(String value) {

    public static final long FIRST_SERIAL = 1;
    public static final long LAST_SERIAL = 999_999;

    private static final Pattern FORMAT = Pattern.compile("\\d{4}-\\d{6}");

    public ReceiptNumber {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("A receipt number is YYYY-NNNNNN: " + value);
        }
    }

    public static ReceiptNumber of(Year issuedIn, long serial) {
        if (issuedIn == null) {
            throw new IllegalArgumentException("The year of issue is required");
        }
        if (serial < FIRST_SERIAL || serial > LAST_SERIAL) {
            throw new IllegalArgumentException("A receipt serial is between " + FIRST_SERIAL + " and " + LAST_SERIAL + ": " + serial);
        }
        return new ReceiptNumber("%04d-%06d".formatted(issuedIn.getValue(), serial));
    }

    @Override
    public String toString() {
        return value;
    }
}
