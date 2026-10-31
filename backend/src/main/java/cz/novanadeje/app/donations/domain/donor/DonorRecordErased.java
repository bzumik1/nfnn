package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class DonorRecordErased extends Conflict {

    public static final String CODE = "donations/donor-erased";

    public DonorRecordErased(DonorReference donor) {
        super(CODE, "The personal data of donor " + donor + " are erased, so no new receipt is issued");
    }
}
