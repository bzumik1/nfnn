package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofReader;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public interface ReceiptSigner extends ReceiptProofReader.SignatureCheck {

    ReceiptSigningKeyId keyId();

    byte[] publicKey();

    byte[] sign(byte[] message);
}
