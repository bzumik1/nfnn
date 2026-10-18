package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class DonationNotFound extends NotFound {

    public static final String CODE = "donations/donation-not-found";

    public DonationNotFound(DonationId id) {
        super(CODE, "Donation " + id + " is not one of the caller's donations");
    }
}
