package cz.novanadeje.app.donors.domain;

public record PasswordHash(String value) {

    public PasswordHash {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Password hash is required");
        }
    }

    @Override
    public String toString() {
        return "PasswordHash[***]";
    }
}
