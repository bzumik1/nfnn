package cz.novanadeje.app.shared.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.random.RandomGenerator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record SecondFactorRecoveryCode(String value) {

    public static final int LENGTH = 8;
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final String MESSAGE_WORD = "OBNOVA";
    private static final Pattern SHAPE = Pattern.compile("[A-HJ-NP-Z2-9]{8}");
    private static final Pattern IN_MESSAGE = Pattern.compile(
            "(?<![A-Z0-9])" + MESSAGE_WORD + "[\\s:-]*([A-HJ-NP-Z2-9]{4})[\\s-]?([A-HJ-NP-Z2-9]{4})(?![A-Z0-9])");

    public SecondFactorRecoveryCode {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A second-factor recovery code is eight letters and digits that do not look alike");
        }
    }

    public static SecondFactorRecoveryCode generate(RandomGenerator random) {
        StringBuilder code = new StringBuilder(LENGTH);
        while (code.length() < LENGTH) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return new SecondFactorRecoveryCode(code.toString());
    }

    public static Optional<SecondFactorRecoveryCode> findIn(String message) {
        if (message == null) {
            return Optional.empty();
        }
        Matcher matcher = IN_MESSAGE.matcher(plain(message));
        return matcher.find() ? Optional.of(new SecondFactorRecoveryCode(matcher.group(1) + matcher.group(2))) : Optional.empty();
    }

    public String message() {
        return MESSAGE_WORD + " " + value;
    }

    public String hash() {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    private static String plain(String message) {
        return Normalizer.normalize(message, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT);
    }

    @Override
    public String toString() {
        return "SecondFactorRecoveryCode[***]";
    }
}
