package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ReceiptBeforeFirstYear extends RuleViolation {

    public static final String CODE = "donations/receipt-before-first-year";

    public ReceiptBeforeFirstYear(FirstReceiptYear firstYear) {
        super(CODE, "Receipts are issued for donations from " + firstYear);
    }
}
