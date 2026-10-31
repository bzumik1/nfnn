package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptUnprintable extends Conflict {

    public static final String CODE = "donations/receipt-unprintable";

    public ReceiptUnprintable(DonorReference donor) {
        super(CODE, "The printed data of the receipt for donor " + donor + " holds a character outside the printable set, so no receipt is numbered");
    }
}
