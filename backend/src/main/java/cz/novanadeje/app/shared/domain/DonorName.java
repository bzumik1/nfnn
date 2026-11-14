package cz.novanadeje.app.shared.domain;

public record DonorName(String value) {

    public static final int MAX_LENGTH = 160;
    public static final String NOT_BLANK = "(?s).*\\P{javaWhitespace}.*";

    public DonorName {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Name is required");
        }
        value = value.trim();
        if (value.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("Name must not exceed " + MAX_LENGTH + " characters");
        }
    }

    @Override
    public String toString() {
        return value;
    }
}
