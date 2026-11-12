package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class BankLogoSourceInvalid extends RuleViolation {

    public static final String CODE = "donations/bank-logo-source-invalid";

    public BankLogoSourceInvalid() {
        super(CODE, "A bank logo source is an https address on an allowed host of that bank");
    }
}
