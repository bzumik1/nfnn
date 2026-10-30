package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptIssueLimitReached extends Conflict {

    public static final String CODE = "donations/receipt-issue-limit";

    public ReceiptIssueLimitReached(DonorReference donor, int limit) {
        super(CODE, "Donor " + donor + " was issued " + limit + " replacement receipts in the last 24 hours, no further replacement is numbered yet");
    }
}
