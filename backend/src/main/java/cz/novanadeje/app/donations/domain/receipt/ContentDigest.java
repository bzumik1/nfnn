package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.Sha256;

import java.util.regex.Pattern;

public record ContentDigest(String value) {

    public static final int LENGTH = 64;
    public static final String SHAPE_REGEX = "[0-9a-f]{" + LENGTH + "}";
    private static final Pattern FORMAT = Pattern.compile(SHAPE_REGEX);

    public ContentDigest {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("A content digest is the SHA-256 in 64 lowercase hex characters");
        }
    }

    public static ContentDigest of(byte[] content) {
        if (content == null) {
            throw new IllegalArgumentException("Content to digest is required");
        }
        return new ContentDigest(Sha256.hex(content));
    }

    @Override
    public String toString() {
        return value;
    }
}
