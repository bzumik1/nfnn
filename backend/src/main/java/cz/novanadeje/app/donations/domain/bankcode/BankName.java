package cz.novanadeje.app.donations.domain.bankcode;

public record BankName(String value) {

    public static final int MAX_LENGTH = 120;

    public BankName {
        if (value == null) {
            throw new IllegalArgumentException("A bank name is required");
        }
        value = value.strip();
        if (value.isEmpty() || value.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("A bank name has 1 to " + MAX_LENGTH + " characters");
        }
        if (value.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("A bank name has no control characters");
        }
    }
}
