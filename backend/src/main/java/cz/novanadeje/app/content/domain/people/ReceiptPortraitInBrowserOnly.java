package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReceiptPortraitInBrowserOnly extends AccessDenied {

    public static final String CODE = "content/receipt-portrait-in-browser-only";

    public ReceiptPortraitInBrowserOnly() {
        super(CODE, "The portrait of the person who signs the receipts is changed only in the administration in a browser, never through a connected application");
    }
}
