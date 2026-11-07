package cz.novanadeje.app.donations.domain.bankcode;

import java.util.regex.Pattern;

public record BankCode(String value) {

    public static final int LENGTH = 4;
    private static final Pattern DIGITS = Pattern.compile("[0-9]{4}");

    public BankCode {
        if (value == null || !DIGITS.matcher(value).matches()) {
            throw new IllegalArgumentException("A bank code is exactly four digits");
        }
    }
}
