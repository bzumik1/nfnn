package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSignatoryMissing extends Conflict {

    public static final String CODE = "donations/receipt-signatory-missing";

    public ReceiptSignatoryMissing() {
        super(CODE, "No person of the foundation is chosen to sign the receipts, so no new receipt is issued");
    }
}
