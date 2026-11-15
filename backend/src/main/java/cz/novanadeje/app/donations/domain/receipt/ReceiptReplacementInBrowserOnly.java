package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReceiptReplacementInBrowserOnly extends AccessDenied {

    public static final String CODE = "donations/receipt-replacement-in-browser-only";

    public ReceiptReplacementInBrowserOnly() {
        super(CODE, "An active receipt is replaced only in the administration in a browser, never through a connected application");
    }
}
