package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public record ReceiptVerification(ReceiptSigningKeyId keyId, ReceiptProof proof) {

    public ReceiptVerification {
        if (keyId == null || proof == null) {
            throw new IllegalArgumentException("A receipt's verification names its signing key and holds its proof");
        }
    }

    public String qrText() {
        return proof.text();
    }

    public ContentDigest statusDigest(String foundationCompanyIdentifier) {
        return ContentDigest.of(proof.bytes());
    }
}
