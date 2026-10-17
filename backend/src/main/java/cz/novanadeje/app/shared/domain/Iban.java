package cz.novanadeje.app.shared.domain;

import java.util.Locale;
import java.util.regex.Pattern;

public record Iban(String value) {

    private static final Pattern SHAPE = Pattern.compile("[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}");
    private static final int CHECKSUM_MODULUS = 97;
    private static final int VALID_REMAINDER = 1;
    private static final int COUNTRY_AND_CHECK_DIGITS = 4;
    private static final int LETTER_RADIX = 36;

    public Iban {
        if (value == null) {
            throw new IllegalArgumentException("IBAN is required");
        }
        value = value.replaceAll("\\s", "").toUpperCase(Locale.ROOT);
        if (!SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("IBAN is not well formed: " + value);
        }
        if (remainder(value) != VALID_REMAINDER) {
            throw new IllegalArgumentException("IBAN check digits do not match: " + value);
        }
    }

    private static int remainder(String iban) {
        String rearranged = iban.substring(COUNTRY_AND_CHECK_DIGITS) + iban.substring(0, COUNTRY_AND_CHECK_DIGITS);
        int remainder = 0;
        for (char character : rearranged.toCharArray()) {
            int number = Character.digit(character, LETTER_RADIX);
            int shift = number < 10 ? 10 : 100;
            remainder = (remainder * shift + number) % CHECKSUM_MODULUS;
        }
        return remainder;
    }

    @Override
    public String toString() {
        return value;
    }
}
