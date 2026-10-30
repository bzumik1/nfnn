package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;

import java.time.Instant;

public record PublishedReceiptKey(ReceiptSigningKeyId id, byte[] publicKey, Instant registeredAt, ReceiptSigningKeyStatus status, boolean published,
                                  boolean current) {

    public PublishedReceiptKey {
        publicKey = publicKey.clone();
    }

    @Override
    public byte[] publicKey() {
        return publicKey.clone();
    }
}
