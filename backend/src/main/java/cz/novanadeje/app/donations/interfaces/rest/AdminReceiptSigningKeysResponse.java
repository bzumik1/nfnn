package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.signing.PublishedReceiptKey;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeyMismatch;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeysOverview;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

record AdminReceiptSigningKeysResponse(String currentKeyId, boolean currentKeyPublished, List<Key> keys, List<Mismatch> auditMismatches) {

    AdminReceiptSigningKeysResponse {
        keys = List.copyOf(keys);
        auditMismatches = List.copyOf(auditMismatches);
    }

    static AdminReceiptSigningKeysResponse of(ReceiptSigningKeysOverview overview) {
        return new AdminReceiptSigningKeysResponse(overview.currentKeyId().value(), overview.currentKeyPublished(),
                overview.keys().stream().map(Key::of).toList(), overview.mismatches().stream().map(Mismatch::of).toList());
    }

    record Mismatch(String keyId, String kind) {

        static Mismatch of(ReceiptSigningKeyMismatch mismatch) {
            return new Mismatch(mismatch.keyId().value(), mismatch.kind().name().toLowerCase(Locale.ROOT));
        }
    }

    record Key(String keyId, String algorithm, String publicKey, String status, Instant registeredAt, boolean published, boolean current) {

        static Key of(PublishedReceiptKey key) {
            return new Key(key.id().value(), ReceiptKeysResponse.ALGORITHM, Base64.getUrlEncoder().withoutPadding().encodeToString(key.publicKey()),
                    key.status().name().toLowerCase(Locale.ROOT), key.registeredAt(), key.published(), key.current());
        }
    }
}
