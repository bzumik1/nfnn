package cz.novanadeje.app.donations.domain.receipt.proof;

import java.util.Arrays;

public record ReceiptProof(byte[] body, byte[] signature) {

    public static final int SIGNATURE_BYTES = 64;

    public ReceiptProof {
        if (body == null || signature == null || signature.length != SIGNATURE_BYTES) {
            throw new IllegalArgumentException("A receipt proof is a body and its " + SIGNATURE_BYTES + "-byte signature");
        }
        body = body.clone();
        signature = signature.clone();
    }

    @Override
    public byte[] body() {
        return body.clone();
    }

    @Override
    public byte[] signature() {
        return signature.clone();
    }

    public byte[] bytes() {
        byte[] bytes = Arrays.copyOf(body, body.length + SIGNATURE_BYTES);
        System.arraycopy(signature, 0, bytes, body.length, SIGNATURE_BYTES);
        return bytes;
    }

    public String text() {
        return ReceiptProofText.of(bytes());
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof ReceiptProof proof && Arrays.equals(body, proof.body) && Arrays.equals(signature, proof.signature);
    }

    @Override
    public int hashCode() {
        return 31 * Arrays.hashCode(body) + Arrays.hashCode(signature);
    }

    @Override
    public String toString() {
        return "ReceiptProof[" + (body.length + SIGNATURE_BYTES) + " bytes]";
    }
}
