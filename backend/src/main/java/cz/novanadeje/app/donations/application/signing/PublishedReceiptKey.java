package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;

import java.time.Instant;
import java.util.Arrays;

public record PublishedReceiptKey(ReceiptSigningKeyId id, byte[] publicKey, Instant registeredAt, ReceiptSigningKeyStatus status, boolean published,
                                  boolean current) {

    public PublishedReceiptKey {
        publicKey = publicKey.clone();
    }

    @Override
    public byte[] publicKey() {
        return publicKey.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof PublishedReceiptKey key && id.equals(key.id) && Arrays.equals(publicKey, key.publicKey)
                && registeredAt.equals(key.registeredAt) && status == key.status && published == key.published && current == key.current;
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return "PublishedReceiptKey[" + id + ", " + status + ", registered " + registeredAt + ", published " + published + ", current " + current + "]";
    }
}
