package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class BankLogoNotFound extends NotFound {

    public static final String CODE = "donations/bank-logo-not-found";

    public BankLogoNotFound() {
        super(CODE, "No logo is set for this bank");
    }
}
