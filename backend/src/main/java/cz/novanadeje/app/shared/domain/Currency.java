package cz.novanadeje.app.shared.domain;

public enum Currency {
    CZK;

    public static Currency fromCode(String code) {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("Currency code is required");
        }
        try {
            return Currency.valueOf(code.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            throw new IllegalArgumentException("Unsupported currency: " + code);
        }
    }
}
