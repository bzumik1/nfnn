package cz.novanadeje.app.donations.domain.receipt.proof;

public class InvalidReceiptProof extends IllegalArgumentException {

    private final ReceiptProofRejection rejection;

    public InvalidReceiptProof(ReceiptProofRejection rejection) {
        super("The receipt proof is refused: " + rejection.code());
        this.rejection = rejection;
    }

    public ReceiptProofRejection rejection() {
        return rejection;
    }
}
