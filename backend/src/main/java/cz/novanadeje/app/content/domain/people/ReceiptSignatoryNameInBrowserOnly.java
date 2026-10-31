package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReceiptSignatoryNameInBrowserOnly extends AccessDenied {

    public static final String CODE = "content/receipt-signatory-name-in-browser-only";

    public ReceiptSignatoryNameInBrowserOnly() {
        super(CODE, "The name of the person who signs the receipts is changed only in the administration in a browser, never through a connected application");
    }
}
