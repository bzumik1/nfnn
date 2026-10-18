package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.shared.domain.error.NotFound;

public class ReceiptNotAvailable extends NotFound {

    public static final String CODE = "donations/receipt-not-available";

    public ReceiptNotAvailable(DonationId id) {
        super(CODE, "Donation " + id + " was not received, so it has no receipt");
    }
}
