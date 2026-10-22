package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class DonorRecordNotFound extends NotFound {

    public static final String CODE = "donations/donor-not-found";

    public DonorRecordNotFound(DonorReference id) {
        super(CODE, "Donor " + id + " has no record in donations");
    }
}
