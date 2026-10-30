package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.PublishedReceiptKey;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

record ReceiptKeysResponse(Foundation foundation, List<Key> keys) {

    static final String ALGORITHM = "Ed25519";
    private static final int ETAG_BYTES = 12;

    ReceiptKeysResponse {
        keys = List.copyOf(keys);
    }

    static ReceiptKeysResponse of(FoundationIdentity foundation, List<PublishedReceiptKey> published) {
        return new ReceiptKeysResponse(new Foundation(foundation.name(), foundation.companyIdentifier()),
                published.stream().map(Key::of).toList());
    }

    String entityTag() {
        StringBuilder content = new StringBuilder(foundation.name()).append('\n').append(foundation.companyIdentifier());
        for (Key key : keys) {
            content.append('\n').append(key.keyId()).append(' ').append(key.publicKey()).append(' ').append(key.status()).append(' ')
                    .append(key.registeredAt());
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.toString().getBytes(StandardCharsets.UTF_8));
            return "\"" + Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(digest, ETAG_BYTES)) + "\"";
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is part of every Java platform", missing);
        }
    }

    record Foundation(String name, String companyIdentifier) {
    }

    record Key(String keyId, String algorithm, String publicKey, String status, Instant registeredAt) {

        static Key of(PublishedReceiptKey key) {
            return new Key(key.id().value(), ALGORITHM, Base64.getUrlEncoder().withoutPadding().encodeToString(key.publicKey()),
                    key.status().name().toLowerCase(Locale.ROOT), key.registeredAt());
        }
    }
}
