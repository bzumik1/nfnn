package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.Sha256;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

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
        return Sha256.hex(value.getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public String toString() {
        return "RefreshTokenSecret[***]";
    }
}
