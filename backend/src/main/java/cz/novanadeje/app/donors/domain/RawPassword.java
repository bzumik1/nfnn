package cz.novanadeje.app.donors.domain;

import java.util.Locale;
import java.util.Set;

public record RawPassword(String value) {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = Set.of(
            "password1234", "password12345", "passwordpassword", "123456789012", "1234567890123",
            "qwertyuiop12", "qwertyuiopas", "iloveyou1234", "administrator", "welcome12345",
            "letmein12345", "football1234", "sunshine1234", "princess1234", "novanadeje12",
            "heslo1234567", "hesloheslo12", "nadacninfond"
    );

    public RawPassword {
        if (value == null || value.length() < MIN_LENGTH) {
            throw PasswordTooWeak.tooShort(MIN_LENGTH);
        }
        if (value.length() > MAX_LENGTH) {
            throw PasswordTooWeak.tooLong(MAX_LENGTH);
        }
        if (COMMON.contains(value.toLowerCase(Locale.ROOT))) {
            throw PasswordTooWeak.tooCommon();
        }
    }

    @Override
    public String toString() {
        return "RawPassword[***]";
    }
}
