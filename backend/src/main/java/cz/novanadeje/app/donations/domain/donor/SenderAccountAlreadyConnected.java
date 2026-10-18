package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SenderAccountAlreadyConnected extends Conflict {

    public static final String CODE = "donations/bank-account-already-connected";

    public SenderAccountAlreadyConnected(SenderAccountLinkId id) {
        super(CODE, "Bank account " + id + " is still connected or already waiting for a payment");
    }
}
