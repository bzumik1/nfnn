package cz.novanadeje.app.donations.domain.signing;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSigningKeyAlreadyWithdrawn extends Conflict {

    public static final String CODE = "donations/receipt-signing-key-already-withdrawn";

    public ReceiptSigningKeyAlreadyWithdrawn(ReceiptSigningKeyId id) {
        super(CODE, "The receipt signing key " + id + " is already withdrawn");
    }
}
