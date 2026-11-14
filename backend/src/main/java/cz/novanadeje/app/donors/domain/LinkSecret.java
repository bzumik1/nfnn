package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.Sha256;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;

public record LinkSecret(String value) {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BYTES = 32;
    private static final Pattern SHAPE = Pattern.compile("^[A-Za-z0-9_-]{43}$");

    public LinkSecret {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("Link secret must be 43 base64url characters");
        }
    }

    public static LinkSecret generate() {
        byte[] bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return new LinkSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    public String hash() {
        return Sha256.hex(value.getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public String toString() {
        return "LinkSecret[***]";
    }
}
