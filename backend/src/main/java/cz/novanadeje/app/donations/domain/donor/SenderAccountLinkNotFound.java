package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class SenderAccountLinkNotFound extends NotFound {

    public static final String CODE = "donations/bank-account-not-found";

    public SenderAccountLinkNotFound(SenderAccountLinkId id) {
        super(CODE, "Bank account " + id + " is not one of the caller's bank accounts");
    }
}
