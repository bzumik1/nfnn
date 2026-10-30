package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.Arrays;

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
        byte[] message = ReceiptProofMessage.of(foundationCompanyIdentifier, proof.body());
        byte[] signedMessage = Arrays.copyOf(message, message.length + ReceiptProof.SIGNATURE_BYTES);
        System.arraycopy(proof.signature(), 0, signedMessage, message.length, ReceiptProof.SIGNATURE_BYTES);
        return ContentDigest.of(signedMessage);
    }
}
