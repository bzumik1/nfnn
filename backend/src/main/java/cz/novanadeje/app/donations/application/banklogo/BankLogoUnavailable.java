package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;

public class BankLogoUnavailable extends RuntimeException {

    private final BankLogoFailure failure;

    public BankLogoUnavailable(BankLogoFailure failure) {
        super(failure.word(), null, false, false);
        this.failure = failure;
    }

    public BankLogoFailure failure() {
        return failure;
    }
}
