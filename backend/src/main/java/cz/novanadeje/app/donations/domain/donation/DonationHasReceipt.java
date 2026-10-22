package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class DonationHasReceipt extends Conflict {

    public static final String CODE = "donations/donation-has-receipt";

    public DonationHasReceipt(DonationId id) {
        super(CODE, "Donation " + id + " has an issued receipt and cannot be unpaired");
    }
}
