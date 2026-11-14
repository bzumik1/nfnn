package cz.novanadeje.app.donors.domain;

public record RawPassword(String value) {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    public RawPassword {
        if (value == null || value.length() < MIN_LENGTH) {
            throw PasswordTooWeak.tooShort(MIN_LENGTH);
        }
        if (value.length() > MAX_LENGTH) {
            throw PasswordTooWeak.tooLong(MAX_LENGTH);
        }
    }

    @Override
    public String toString() {
        return "RawPassword[***]";
    }
}
