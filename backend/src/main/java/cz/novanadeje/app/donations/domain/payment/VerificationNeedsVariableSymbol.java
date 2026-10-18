package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class VerificationNeedsVariableSymbol extends RuleViolation {

    public static final String CODE = "donations/verification-needs-variable-symbol";

    public VerificationNeedsVariableSymbol() {
        super(CODE, "A QR payment that verifies an account needs the donor's variable symbol");
    }
}
