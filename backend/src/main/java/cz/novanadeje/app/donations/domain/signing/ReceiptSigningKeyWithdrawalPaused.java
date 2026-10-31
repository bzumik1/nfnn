package cz.novanadeje.app.donations.domain.signing;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class ReceiptSigningKeyWithdrawalPaused extends Conflict {

    public static final String CODE = "donations/receipt-signing-key-withdrawal-paused";

    public ReceiptSigningKeyWithdrawalPaused() {
        super(CODE, "Receipt signing keys are not withdrawn for a while after too many refused second factors");
    }
}
