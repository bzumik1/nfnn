package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PaymentToErasedDonor extends Conflict {

    public static final String CODE = "donations/payment-to-erased-donor";

    public PaymentToErasedDonor(DonorReference donor) {
        super(CODE, "The personal data of donor " + donor + " are erased, so no payment is paired with the donor");
    }
}
