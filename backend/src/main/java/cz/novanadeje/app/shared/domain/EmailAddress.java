package cz.novanadeje.app.shared.domain;

import java.util.regex.Pattern;

public record EmailAddress(String value) {

    private static final int MAX_LENGTH = 254;
    private static final Pattern SHAPE = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public EmailAddress {
        if (value == null) {
            throw new IllegalArgumentException("Email address is required");
        }
        value = value.trim();
        if (value.length() > MAX_LENGTH || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("Email address is not valid: " + value);
        }
    }

    @Override
    public String toString() {
        return value;
    }
}
