package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class ReceiptImageNotFound extends NotFound {

    public static final String CODE = "donations/receipt-image-not-found";

    public ReceiptImageNotFound(ContentDigest digest) {
        super(CODE, "No receipt of the donor shows the image " + digest);
    }
}
