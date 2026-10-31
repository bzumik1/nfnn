package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public record ReceiptSigningKeyMismatch(ReceiptSigningKeyId keyId, Kind kind) {

    public enum Kind {
        MISSING,
        REVERTED
    }
}
