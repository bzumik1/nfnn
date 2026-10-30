package cz.novanadeje.app.donations.domain.receipt;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Pattern;

public record ContentDigest(String value) {

    public static final int LENGTH = 64;
    public static final String SHAPE_REGEX = "[0-9a-f]{" + LENGTH + "}";
    private static final Pattern FORMAT = Pattern.compile(SHAPE_REGEX);

    public ContentDigest {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("A content digest is the SHA-256 in 64 lowercase hex characters: " + value);
        }
    }

    public static ContentDigest of(byte[] content) {
        if (content == null) {
            throw new IllegalArgumentException("Content to digest is required");
        }
        try {
            return new ContentDigest(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    @Override
    public String toString() {
        return value;
    }
}
