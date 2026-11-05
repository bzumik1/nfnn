package cz.novanadeje.app.donations.domain.signing;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSigningKeyUnpublished extends Conflict {

    public static final String CODE = "donations/receipt-signing-key-unpublished";

    public ReceiptSigningKeyUnpublished(ReceiptSigningKeyId id) {
        super(CODE, "The receipt signing key " + id + " of this server is not published, so a receipt it signed could not be verified");
    }
}
