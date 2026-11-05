package cz.novanadeje.app.operations.domain.push;

import java.time.Instant;

public record PushKey(String publicKey, String sealedPrivateKey, Instant createdAt) {

    public static final String SEAL_PURPOSE = "push-vapid-private-key";
    public static final int MAX_SEALED_LENGTH = 200;

    public PushKey {
        if (publicKey == null || sealedPrivateKey == null || sealedPrivateKey.length() > MAX_SEALED_LENGTH || createdAt == null) {
            throw new IllegalArgumentException("A stored push key holds its public key, its sealed private key and its time");
        }
    }

    @Override
    public String toString() {
        return "PushKey[publicKey=" + publicKey + ", createdAt=" + createdAt + "]";
    }
}
