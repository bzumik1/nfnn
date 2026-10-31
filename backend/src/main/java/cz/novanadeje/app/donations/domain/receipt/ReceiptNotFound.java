package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class ReceiptNotFound extends NotFound {

    public static final String CODE = "donations/receipt-not-found";

    public ReceiptNotFound(DonationReceiptId id) {
        super(CODE, "Receipt " + id.value() + " is not one of the donor's receipts");
    }
}
