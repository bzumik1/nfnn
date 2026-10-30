package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptProofs;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptVerification;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class ReceiptFreezer {

    private final ReceiptTextSource texts;
    private final ReceiptProofs proofs;
    private final ReceiptSigner signer;

    public ReceiptFreezer(ReceiptTextSource texts, ReceiptProofs proofs, ReceiptSigner signer) {
        this.texts = texts;
        this.proofs = proofs;
        this.signer = signer;
    }

    public FrozenReceipt freeze(ReceiptDocument document, Optional<ContentDigest> signatureImage) {
        throw new UnsupportedOperationException("Freezing a receipt arrives with the implementation of slice 1.6");
    }
}
