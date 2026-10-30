package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.PaymentDetails;
import org.springframework.stereotype.Service;

@Service
public class PaymentDetailsService {

    private final PaymentDetails details;

    public PaymentDetailsService(BankAccount foundationAccount) {
        this.details = PaymentDetails.of(foundationAccount);
    }

    public PaymentDetails details() {
        return details;
    }
}
