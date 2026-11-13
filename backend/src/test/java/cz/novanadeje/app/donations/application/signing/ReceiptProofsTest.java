package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.receipt.InvalidReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.ReceiptProofRejection;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.infrastructure.signing.Rfc8032Keys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptProofsTest {

    @Test
    @DisplayName("Given a signer whose signature does not verify, when a proof is made, then the read-back refuses it as the server's own error, never as the client's")
    void should_refuse_as_the_servers_error_when_proved_given_a_signature_that_does_not_verify() {
        ReceiptProofs proofs = new ReceiptProofs(new SignerThatNeverVerifies(Rfc8032Keys.test1Signer()), FOUNDATION);
        SignedReceipt receipt = SignedReceipt.of(singleDocument(jana(), receivedFromJana(LocalDate.of(2026, 3, 15), 50000)));

        assertThatThrownBy(() -> proofs.prove(receipt))
                .isInstanceOfSatisfying(InvalidReceiptProof.class, refused -> assertThat(refused.rejection()).isEqualTo(ReceiptProofRejection.BAD_SIGNATURE))
                .isNotInstanceOf(IllegalArgumentException.class);
    }

    private record SignerThatNeverVerifies(ReceiptSigner signer) implements ReceiptSigner {

        @Override
        public ReceiptSigningKeyId keyId() {
            return signer.keyId();
        }

        @Override
        public byte[] publicKey() {
            return signer.publicKey();
        }

        @Override
        public byte[] sign(byte[] message) {
            return signer.sign(message);
        }

        @Override
        public boolean verifies(byte[] publicKey, byte[] message, byte[] signature) {
            return false;
        }
    }
}
