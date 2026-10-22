package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SymbolClaimHasReceipt extends Conflict {

    public static final String CODE = "donations/symbol-claim-has-receipt";

    public SymbolClaimHasReceipt(SymbolClaimId id) {
        super(CODE, "An issued receipt covers a donation paired through symbol claim " + id + ", the claim cannot be reversed");
    }
}
