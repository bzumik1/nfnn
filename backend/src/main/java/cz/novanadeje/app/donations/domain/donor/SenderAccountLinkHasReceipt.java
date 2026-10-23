package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SenderAccountLinkHasReceipt extends Conflict {

    public static final String CODE = "donations/bank-account-has-receipt";

    public SenderAccountLinkHasReceipt(SenderAccountLinkId id) {
        super(CODE, "An issued receipt covers a donation paired through bank account link " + id + ", the link cannot be removed");
    }
}
