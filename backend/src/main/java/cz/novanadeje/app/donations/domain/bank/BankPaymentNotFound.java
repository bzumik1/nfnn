package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class BankPaymentNotFound extends NotFound {

    public static final String CODE = "donations/bank-payment-not-found";

    public BankPaymentNotFound(BankPaymentId id) {
        super(CODE, "Bank payment " + id + " is not stored");
    }
}
