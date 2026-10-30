package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;

import java.math.BigInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record CzechAccountNumber(String value) {

    private static final Pattern FORMAT = Pattern.compile("(?:([0-9]{1,6})-)?([0-9]{1,10})/([0-9]{4})");
    private static final int[] WEIGHTS = {6, 3, 7, 9, 10, 5, 8, 4, 2, 1};
    private static final int CHECK_MODULUS = 11;
    private static final int PREFIX_DIGITS = 6;
    private static final int NUMBER_DIGITS = 10;
    private static final String COUNTRY = "CZ";
    private static final String COUNTRY_AS_DIGITS = "123500";
    private static final BigInteger IBAN_MODULUS = BigInteger.valueOf(97);
    private static final int IBAN_CHECK_BASE = 98;

    public CzechAccountNumber {
        if (value == null) {
            throw new IllegalArgumentException("Account number is required");
        }
        value = value.trim();
        Matcher parts = FORMAT.matcher(value);
        if (!parts.matches()) {
            throw new IllegalArgumentException("Account number must look like [prefix-]number/bank code: " + value);
        }
        if (parts.group(1) != null && !passesModulo11(parts.group(1))) {
            throw new IllegalArgumentException("Account number prefix fails the modulo 11 check: " + value);
        }
        if (!passesModulo11(parts.group(2))) {
            throw new IllegalArgumentException("Account number fails the modulo 11 check: " + value);
        }
        if (Long.parseLong(parts.group(2)) == 0) {
            throw new IllegalArgumentException("Account number must not be zero: " + value);
        }
    }

    public Iban toIban() {
        Matcher parts = FORMAT.matcher(value);
        if (!parts.matches()) {
            throw new IllegalStateException("A validated account number no longer matches its format: " + value);
        }
        String prefix = parts.group(1) == null ? "" : parts.group(1);
        String basicBankAccountNumber = parts.group(3) + zeroPadded(prefix, PREFIX_DIGITS) + zeroPadded(parts.group(2), NUMBER_DIGITS);
        int checkDigits = IBAN_CHECK_BASE - new BigInteger(basicBankAccountNumber + COUNTRY_AS_DIGITS).mod(IBAN_MODULUS).intValue();
        return new Iban(COUNTRY + String.format("%02d", checkDigits) + basicBankAccountNumber);
    }

    private static boolean passesModulo11(String digits) {
        String padded = zeroPadded(digits, NUMBER_DIGITS);
        int sum = 0;
        for (int index = 0; index < NUMBER_DIGITS; index++) {
            sum += Character.digit(padded.charAt(index), 10) * WEIGHTS[index];
        }
        return sum % CHECK_MODULUS == 0;
    }

    private static String zeroPadded(String digits, int length) {
        return "0".repeat(length - digits.length()) + digits;
    }

    @Override
    public String toString() {
        return value;
    }
}
