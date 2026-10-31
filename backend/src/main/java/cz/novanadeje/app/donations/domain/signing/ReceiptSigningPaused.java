package cz.novanadeje.app.donations.domain.signing;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSigningPaused extends Conflict {

    public static final String CODE = "donations/receipt-signing-paused";

    public ReceiptSigningPaused(ReceiptSigningKeyId id) {
        super(CODE, "The receipt signing key " + id + " of this server is withdrawn and no new seed has replaced it");
    }
}
