package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class ReceiptWithdrawalInBrowserOnly extends AccessDenied {

    public static final String CODE = "donations/receipt-withdrawal-in-browser-only";

    public ReceiptWithdrawalInBrowserOnly(ReceiptNumber active) {
        super(CODE, "Unpairing this donation would withdraw receipt " + active
                + ", which only the administration in a browser does, never a connected application");
    }
}
