package cz.novanadeje.app.shared.domain;

import java.util.regex.Pattern;

public record PostalAddress(String street, String city, String postalCode) {

    public static final int MAX_STREET_LENGTH = 200;
    public static final int MAX_CITY_LENGTH = 120;
    public static final int MAX_POSTAL_CODE_LENGTH = 10;
    private static final Pattern POSTAL_CODE = Pattern.compile("[0-9][0-9 ]*[0-9]");

    public PostalAddress {
        street = requireText(street, "Street", MAX_STREET_LENGTH);
        city = requireText(city, "City", MAX_CITY_LENGTH);
        postalCode = requireText(postalCode, "Postal code", MAX_POSTAL_CODE_LENGTH);
        if (!POSTAL_CODE.matcher(postalCode).matches()) {
            throw new IllegalArgumentException("Postal code must consist of digits");
        }
    }

    public String singleLine() {
        return street + ", " + postalCode + " " + city;
    }

    private static String requireText(String value, String label, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException(label + " must not exceed " + maxLength + " characters");
        }
        return trimmed;
    }
}
