package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SymbolClaimAlreadyAnswered extends Conflict {

    public static final String CODE = "donations/symbol-claim-already-answered";

    public SymbolClaimAlreadyAnswered(SenderAccountLinkId id) {
        super(CODE, "Sender account link " + id + " has an answered symbol claim");
    }
}
