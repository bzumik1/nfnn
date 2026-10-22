package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SymbolClaimStillConfirmed extends Conflict {

    public static final String CODE = "donations/symbol-claim-still-confirmed";

    public SymbolClaimStillConfirmed(SymbolClaimId id) {
        super(CODE, "Symbol claim " + id + " is confirmed; reverse it before deleting the answer");
    }
}
