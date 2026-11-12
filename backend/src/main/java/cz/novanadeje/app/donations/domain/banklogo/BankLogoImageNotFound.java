package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class BankLogoImageNotFound extends NotFound {

    public static final String CODE = "donations/bank-logo-image-not-found";

    public BankLogoImageNotFound() {
        super(CODE, "No bank logo has this image");
    }
}
