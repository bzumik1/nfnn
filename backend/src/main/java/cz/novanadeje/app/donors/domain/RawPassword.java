package cz.novanadeje.app.donors.domain;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public record RawPassword(String value) {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = commonPasswords();

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

    private static Set<String> commonPasswords() {
        try (InputStream list = Objects.requireNonNull(RawPassword.class.getResourceAsStream("common-passwords.txt"), "common-passwords.txt")) {
            return new String(list.readAllBytes(), StandardCharsets.US_ASCII).lines().collect(Collectors.toUnmodifiableSet());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public String toString() {
        return "RawPassword[***]";
    }
}
