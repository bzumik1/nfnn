package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ReceiptTooLong extends RuleViolation {

    public static final String CODE = "donations/receipt-too-long";

    public ReceiptTooLong() {
        super(CODE, "The receipt's proof needs more than " + VerificationQrSymbol.MAX_PROOF_BYTES + " bytes, more than a QR symbol of version "
                + VerificationQrSymbol.MAX_VERSION + " holds");
    }
}
