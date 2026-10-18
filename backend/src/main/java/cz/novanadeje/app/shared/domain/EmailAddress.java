package cz.novanadeje.app.shared.domain;

import java.util.Locale;
import java.util.regex.Pattern;

public record EmailAddress(String value) {

    private static final int MAX_LENGTH = 254;
    public static final String SHAPE_REGEX = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
    private static final Pattern SHAPE = Pattern.compile(SHAPE_REGEX);

    public EmailAddress {
        if (value == null) {
            throw new IllegalArgumentException("Email address is required");
        }
        value = value.trim().toLowerCase(Locale.ROOT);
        if (value.length() > MAX_LENGTH || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("Email address is not valid: " + value);
        }
    }

    public static boolean isValid(String candidate) {
        try {
            new EmailAddress(candidate);
            return true;
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    @Override
    public String toString() {
        return value;
    }
}
