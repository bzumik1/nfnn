package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofBody;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofReader;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptTooLong;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.domain.receipt.proof.VerificationQrSymbol;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class ReceiptProofs {

    private static final Logger log = LoggerFactory.getLogger(ReceiptProofs.class);

    private final ReceiptSigner signer;
    private final FoundationIdentity foundation;
    private final CurrentKeyWithdrawal currentKey;

    public ReceiptProofs(ReceiptSigner signer, FoundationIdentity foundation, CurrentKeyWithdrawal currentKey) {
        this.signer = signer;
        this.foundation = foundation;
        this.currentKey = currentKey;
    }

    public ReceiptProof prove(SignedReceipt receipt) {
        if (currentKey.currentKeyWithdrawn()) {
            log.error("Receipt {} is not signed: the receipt signing key {} of this server is withdrawn and no new seed has replaced it", receipt.number(),
                    signer.keyId());
            throw new ReceiptSigningPaused(signer.keyId());
        }
        byte[] body = ReceiptProofBody.encode(receipt, signer.keyId());
        ReceiptProof proof = new ReceiptProof(body, signer.sign(ReceiptProofMessage.of(foundation.companyIdentifier(), body)));
        if (VerificationQrSymbol.of(proof.text()).isEmpty()) {
            log.error("Receipt {} needs a verification proof of {} bytes, more than a QR code holds, so it is not issued", receipt.number(),
                    proof.bytes().length);
            throw new ReceiptTooLong();
        }
        ReceiptProofReader.KnownKey own = new ReceiptProofReader.KnownKey(signer.keyId(), signer.publicKey(), false);
        ReceiptProofReader.ReadProof read = ReceiptProofReader.read(proof.text(), foundation.companyIdentifier(),
                keyId -> Optional.of(own).filter(key -> key.id().equals(keyId)), signer);
        if (!read.receipt().equals(receipt)) {
            throw new IllegalStateException("The proof of receipt " + receipt.number() + " does not read back as the receipt it was made from");
        }
        return proof;
    }
}
