package cz.novanadeje.app.donations.domain.signing;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Arrays;
import java.util.Locale;
import java.util.function.Function;

public record ReceiptSigningKey(ReceiptSigningKeyId id, byte[] publicKey, Instant registeredAt, ReceiptSigningKeyStatus status, String seal) {

    public static final String SEAL_PURPOSE = "receipt-signing-key";
    public static final int MAX_SEAL_LENGTH = 100;

    public ReceiptSigningKey {
        if (id == null || publicKey == null || registeredAt == null || status == null || seal == null || seal.isBlank()) {
            throw new IllegalArgumentException("A receipt signing key needs its id, public key, registration time, status and seal");
        }
        publicKey = publicKey.clone();
        if (seal.length() > MAX_SEAL_LENGTH) {
            throw new IllegalArgumentException("A seal is at most " + MAX_SEAL_LENGTH + " characters");
        }
    }

    public static ReceiptSigningKey register(byte[] publicKey, Instant now, Function<byte[], String> sealing) {
        ReceiptSigningKeyId id = ReceiptSigningKeyId.of(publicKey);
        Instant registeredAt = now.truncatedTo(ChronoUnit.SECONDS);
        return new ReceiptSigningKey(id, publicKey, registeredAt, ReceiptSigningKeyStatus.ACTIVE,
                sealing.apply(sealedContent(id, publicKey, registeredAt, ReceiptSigningKeyStatus.ACTIVE)));
    }

    private static byte[] sealedContent(ReceiptSigningKeyId id, byte[] publicKey, Instant registeredAt, ReceiptSigningKeyStatus status) {
        return String.join("\n", id.value(), HexFormat.of().formatHex(publicKey), registeredAt.toString(), status.name().toLowerCase(Locale.ROOT))
                .getBytes(StandardCharsets.UTF_8);
    }

    public boolean idMatchesPublicKey() {
        return publicKey.length == ReceiptSigningKeyId.PUBLIC_KEY_BYTES && id.equals(ReceiptSigningKeyId.of(publicKey));
    }

    public byte[] sealedContent() {
        return sealedContent(id, publicKey, registeredAt, status);
    }

    @Override
    public byte[] publicKey() {
        return publicKey.clone();
    }

    public ReceiptSigningKey sealedAgain(String newSeal) {
        return new ReceiptSigningKey(id, publicKey, registeredAt, status, newSeal);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof ReceiptSigningKey key && id.equals(key.id) && Arrays.equals(publicKey, key.publicKey)
                && registeredAt.equals(key.registeredAt) && status == key.status && seal.equals(key.seal);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return "ReceiptSigningKey[" + id + ", " + status + ", registered " + registeredAt + "]";
    }
}
