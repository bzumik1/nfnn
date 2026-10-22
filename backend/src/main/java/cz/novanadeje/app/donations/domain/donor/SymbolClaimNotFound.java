package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class SymbolClaimNotFound extends NotFound {

    public static final String CODE = "donations/symbol-claim-not-found";

    public SymbolClaimNotFound(SymbolClaimId id) {
        super(CODE, "Symbol claim " + id + " is not stored");
    }
}
