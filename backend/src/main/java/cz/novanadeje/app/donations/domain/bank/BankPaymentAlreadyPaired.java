package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BankPaymentAlreadyPaired extends Conflict {

    public static final String CODE = "donations/bank-payment-already-paired";

    public BankPaymentAlreadyPaired(BankPaymentId id) {
        super(CODE, "Bank payment " + id + " already has a donation");
    }
}
