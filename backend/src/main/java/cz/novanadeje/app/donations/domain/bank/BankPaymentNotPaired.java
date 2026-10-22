package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BankPaymentNotPaired extends Conflict {

    public static final String CODE = "donations/bank-payment-not-paired";

    public BankPaymentNotPaired(BankPaymentId id) {
        super(CODE, "Bank payment " + id + " has no donation to unpair");
    }
}
