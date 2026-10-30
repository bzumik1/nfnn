package cz.novanadeje.app.operations.domain.settings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.random.RandomGenerator;

public record SetupCode(String value) {

    public static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    public static final int LENGTH = 12;
    private static final int GROUP = 4;

    public SetupCode {
        if (value == null || value.length() != LENGTH || !value.chars().allMatch(character -> ALPHABET.indexOf(character) >= 0)) {
            throw new IllegalArgumentException("A setup code has " + LENGTH + " characters of its alphabet");
        }
    }

    public static SetupCode generate(RandomGenerator random) {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return new SetupCode(code.toString());
    }

    public boolean matches(String typed) {
        if (typed == null) {
            return false;
        }
        String normalized = typed.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return MessageDigest.isEqual(normalized.getBytes(StandardCharsets.US_ASCII), value.getBytes(StandardCharsets.US_ASCII));
    }

    public String display() {
        return value.substring(0, GROUP) + "-" + value.substring(GROUP, 2 * GROUP) + "-" + value.substring(2 * GROUP);
    }

    @Override
    public String toString() {
        return "SetupCode[********]";
    }
}
