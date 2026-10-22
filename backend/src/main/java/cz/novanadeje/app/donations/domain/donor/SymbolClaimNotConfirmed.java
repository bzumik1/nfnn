package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SymbolClaimNotConfirmed extends Conflict {

    public static final String CODE = "donations/symbol-claim-not-confirmed";

    public SymbolClaimNotConfirmed(SymbolClaimId id) {
        super(CODE, "Symbol claim " + id + " is not confirmed, there is nothing to reverse");
    }
}
