package cz.novanadeje.app.donors.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
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
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    @Override
    public String toString() {
        return "LinkSecret[***]";
    }
}
