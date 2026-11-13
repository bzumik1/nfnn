package cz.novanadeje.app.donations.domain.receipt;

public class InvalidReceiptProof extends RuntimeException {

    private final ReceiptProofRejection rejection;

    public InvalidReceiptProof(ReceiptProofRejection rejection) {
        super("The receipt proof is refused: " + rejection.code());
        this.rejection = rejection;
    }

    public ReceiptProofRejection rejection() {
        return rejection;
    }
}
