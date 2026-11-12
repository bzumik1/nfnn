package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptIssueLimitReached extends Conflict {

    public static final String CODE = "donations/receipt-issue-limit";

    private ReceiptIssueLimitReached(String message) {
        super(CODE, message);
    }

    public static ReceiptIssueLimitReached inADay(DonorReference donor, int limit) {
        return new ReceiptIssueLimitReached("Donor " + donor + " was issued " + limit
                + " replacement receipts in the last 24 hours, no further replacement is numbered yet");
    }

    public static ReceiptIssueLimitReached inAYear(DonorReference donor, int limit) {
        return new ReceiptIssueLimitReached("Donor " + donor + " was issued " + limit
                + " replacement receipts this calendar year, no further replacement is numbered before the next one");
    }
}
