package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class SymbolOfferNotAvailable extends Conflict {

    public static final String CODE = "donations/symbol-offer-not-available";

    public SymbolOfferNotAvailable(SenderAccountLinkId id) {
        super(CODE, "Sender account link " + id + " has no such symbol offer");
    }
}
