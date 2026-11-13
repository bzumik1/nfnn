package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.Sha256;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
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
        return Sha256.hex(value.getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public String toString() {
        return "DeviceStatusSecret[***]";
    }
}
