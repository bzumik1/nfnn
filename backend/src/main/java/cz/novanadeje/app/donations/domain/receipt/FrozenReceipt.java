package cz.novanadeje.app.donations.domain.receipt;

import java.util.Optional;

public record FrozenReceipt(ReceiptDocument document, ReceiptTextSet texts, Optional<ContentDigest> signatureImage,
                            ReceiptVerification verification) {

    public static final int SCHEMA_VERSION = 1;

    public FrozenReceipt {
        if (document == null || texts == null || signatureImage == null || verification == null) {
            throw new IllegalArgumentException("A frozen receipt holds its document, texts, signature image or none, and verification");
        }
        if (!texts.covers(document.locale())) {
            throw new IllegalArgumentException("A receipt in " + document.locale().tag()
                    + " freezes the Czech texts, and the English ones exactly when it is English");
        }
    }

    public ContentDigest statusDigest() {
        return verification.statusDigest(document.foundation().companyIdentifier());
    }

    public int schemaVersion() {
        return SCHEMA_VERSION;
    }
}
