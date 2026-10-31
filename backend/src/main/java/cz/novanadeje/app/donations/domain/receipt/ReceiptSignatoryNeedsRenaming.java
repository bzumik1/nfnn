package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSignatoryNeedsRenaming extends Conflict {

    public static final String CODE = "donations/signatory-needs-renaming";

    public ReceiptSignatoryNeedsRenaming(PersonReference person) {
        super(CODE, "Person " + person + " holds a control character in the name or role, so they are renamed before they sign the receipts");
    }
}
