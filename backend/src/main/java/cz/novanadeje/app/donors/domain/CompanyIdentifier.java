package cz.novanadeje.app.donors.domain;

public record CompanyIdentifier(String value) {

    private static final int LENGTH = 8;
    private static final int[] WEIGHTS = {8, 7, 6, 5, 4, 3, 2};

    public CompanyIdentifier {
        if (value == null) {
            throw new IllegalArgumentException("Company identifier is required");
        }
        value = value.replace(" ", "").trim();
        if (!hasValidCheckDigit(value)) {
            throw new IllegalArgumentException("Company identifier is not valid: " + value);
        }
    }

    public static boolean isValid(String candidate) {
        return candidate != null && hasValidCheckDigit(candidate.replace(" ", "").trim());
    }

    private static boolean hasValidCheckDigit(String digits) {
        if (digits.length() != LENGTH || !digits.chars().allMatch(Character::isDigit)) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < WEIGHTS.length; i++) {
            sum += WEIGHTS[i] * Character.digit(digits.charAt(i), 10);
        }
        int expected = (11 - (sum % 11)) % 10;
        return Character.digit(digits.charAt(LENGTH - 1), 10) == expected;
    }

    @Override
    public String toString() {
        return value;
    }
}
