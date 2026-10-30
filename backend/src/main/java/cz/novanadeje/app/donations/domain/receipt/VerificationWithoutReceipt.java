package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class VerificationWithoutReceipt extends RuleViolation {

    public static final String CODE = "donations/verification-without-receipt";

    public VerificationWithoutReceipt(DonationId id) {
        super(CODE, "Donation " + id + " verified an account, so it has no receipt of its own");
    }
}
