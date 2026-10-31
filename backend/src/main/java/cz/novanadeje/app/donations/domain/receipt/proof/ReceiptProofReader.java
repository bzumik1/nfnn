package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.Arrays;
import java.util.Optional;
import java.util.function.Function;

public final class ReceiptProofReader {

    private static final int SHORTEST_PROOF = ReceiptProofBody.KEY_ID_OFFSET + ReceiptSigningKeyId.BYTES + 1 + ReceiptProof.SIGNATURE_BYTES;

    public interface SignatureCheck {

        boolean verifies(byte[] publicKey, byte[] message, byte[] signature);
    }

    public record KnownKey(ReceiptSigningKeyId id, byte[] publicKey, boolean revoked) {
    }

    public record ReadProof(ReceiptSigningKeyId keyId, SignedReceipt receipt) {
    }

    private ReceiptProofReader() {
    }

    public static ReadProof read(String text, String foundationCompanyIdentifier, Function<ReceiptSigningKeyId, Optional<KnownKey>> keys,
                                 SignatureCheck signatures) {
        byte[] bytes = ReceiptProofText.read(text);
        if (bytes.length == 0) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRUNCATED);
        }
        if ((bytes[0] & 0xff) != ReceiptProofBody.FORMAT) {
            throw new InvalidReceiptProof(ReceiptProofRejection.UNKNOWN_FORMAT);
        }
        if (bytes.length < SHORTEST_PROOF) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRUNCATED);
        }
        byte[] body = Arrays.copyOf(bytes, bytes.length - ReceiptProof.SIGNATURE_BYTES);
        byte[] signature = Arrays.copyOfRange(bytes, body.length, bytes.length);
        ReceiptSigningKeyId keyId = ReceiptProofBody.keyIdOf(body);
        KnownKey key = keys.apply(keyId).orElseThrow(() -> new InvalidReceiptProof(ReceiptProofRejection.UNKNOWN_KEY));
        if (key.revoked()) {
            throw new InvalidReceiptProof(ReceiptProofRejection.REVOKED_KEY);
        }
        if (!signatures.verifies(key.publicKey(), ReceiptProofMessage.of(foundationCompanyIdentifier, body), signature)) {
            throw new InvalidReceiptProof(ReceiptProofRejection.BAD_SIGNATURE);
        }
        return new ReadProof(keyId, ReceiptProofBody.parse(body));
    }
}
