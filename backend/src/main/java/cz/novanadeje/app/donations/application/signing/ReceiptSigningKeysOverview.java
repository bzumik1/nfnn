package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.List;

public record ReceiptSigningKeysOverview(ReceiptSigningKeyId currentKeyId, boolean currentKeyPublished, List<PublishedReceiptKey> keys) {

    public ReceiptSigningKeysOverview {
        keys = List.copyOf(keys);
    }
}
