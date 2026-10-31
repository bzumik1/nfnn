package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class ReceiptPersonNotFound extends NotFound {

    public static final String CODE = "donations/person-not-found";

    public ReceiptPersonNotFound(PersonReference person) {
        super(CODE, "Person " + person + " is not one of the people of the foundation");
    }
}
