package cz.novanadeje.app.donors.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public record RefreshTokenSecret(String value) {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BYTES = 32;

    public RefreshTokenSecret {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Refresh token secret is required");
        }
    }

    public static RefreshTokenSecret generate() {
        byte[] bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return new RefreshTokenSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    public static RefreshTokenSecret fromValue(String value) {
        return new RefreshTokenSecret(value);
    }

    public String hash() {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    @Override
    public String toString() {
        return "RefreshTokenSecret[***]";
    }
}
