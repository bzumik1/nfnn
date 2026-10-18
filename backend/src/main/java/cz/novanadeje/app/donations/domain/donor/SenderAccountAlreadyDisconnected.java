package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SenderAccountAlreadyDisconnected extends Conflict {

    public static final String CODE = "donations/bank-account-already-disconnected";

    public SenderAccountAlreadyDisconnected(SenderAccountLinkId id) {
        super(CODE, "Bank account " + id + " is already disconnected");
    }
}
