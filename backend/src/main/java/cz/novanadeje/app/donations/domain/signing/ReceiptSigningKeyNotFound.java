package cz.novanadeje.app.donations.domain.signing;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class ReceiptSigningKeyNotFound extends NotFound {

    public static final String CODE = "donations/receipt-signing-key-not-found";

    public ReceiptSigningKeyNotFound() {
        super(CODE, "No published receipt signing key has the id asked for");
    }
}
