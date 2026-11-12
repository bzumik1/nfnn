package cz.novanadeje.app.donors.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

public record DeviceStatusSecret(String value) {

    public static final int LENGTH = 43;
    public static final String SHAPE_REGEX = "[A-Za-z0-9_-]{" + LENGTH + "}";

    private static final Pattern SHAPE = Pattern.compile(SHAPE_REGEX);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BYTES = 32;

    public DeviceStatusSecret {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A device secret is 43 characters of base64url");
        }
    }

    public static DeviceStatusSecret generate() {
        byte[] bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return new DeviceStatusSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
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
        return "DeviceStatusSecret[***]";
    }
}
