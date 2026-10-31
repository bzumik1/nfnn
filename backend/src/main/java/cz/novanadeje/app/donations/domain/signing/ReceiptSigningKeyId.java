package cz.novanadeje.app.donations.domain.signing;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;
import java.util.regex.Pattern;

public record ReceiptSigningKeyId(String value) {

    public static final int BYTES = 4;
    public static final int PUBLIC_KEY_BYTES = 32;
    public static final Set<String> PUBLIC_TEST_KEY_IDS = Set.of("21fe31df", "39f713d0", "dac073e0", "91384c41", "5f9b247e", "c07ba992");
    private static final Pattern FORMAT = Pattern.compile("[0-9a-f]{8}");

    public ReceiptSigningKeyId {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("A receipt signing key id is 8 lowercase hex characters: " + value);
        }
    }

    public static ReceiptSigningKeyId of(byte[] publicKey) {
        if (publicKey == null || publicKey.length != PUBLIC_KEY_BYTES) {
            throw new IllegalArgumentException("An Ed25519 public key has " + PUBLIC_KEY_BYTES + " bytes");
        }
        try {
            return fromBytes(Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest(publicKey), BYTES));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    public static ReceiptSigningKeyId fromBytes(byte[] bytes) {
        if (bytes == null || bytes.length != BYTES) {
            throw new IllegalArgumentException("A receipt signing key id has " + BYTES + " bytes");
        }
        return new ReceiptSigningKeyId(HexFormat.of().formatHex(bytes));
    }

    public boolean isPublicTestKey() {
        return PUBLIC_TEST_KEY_IDS.contains(value);
    }

    public byte[] bytes() {
        return HexFormat.of().parseHex(value);
    }

    @Override
    public String toString() {
        return value;
    }
}
