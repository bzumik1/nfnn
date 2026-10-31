package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReceiptReplacementInBrowserOnly extends AccessDenied {

    public static final String CODE = "donations/receipt-replacement-in-browser-only";

    public ReceiptReplacementInBrowserOnly(ReceiptNumber active) {
        super(CODE, "Receipt " + active + " is replaced only in the administration in a browser, never through a connected application");
    }
}
