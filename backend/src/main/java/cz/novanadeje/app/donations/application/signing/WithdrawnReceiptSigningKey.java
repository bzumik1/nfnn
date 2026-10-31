package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public record WithdrawnReceiptSigningKey(ReceiptSigningKeyId id, boolean current) {
}
