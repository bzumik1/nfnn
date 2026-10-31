package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSignatoryUnprintable extends Conflict {

    public static final String CODE = "donations/signatory-unprintable";

    public ReceiptSignatoryUnprintable(PersonReference person) {
        super(CODE, "Person " + person + " has a name with a character no receipt can print, so they are renamed before they sign the receipts");
    }
}
