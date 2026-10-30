package cz.novanadeje.app.donations.application;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.PaymentDetails;
import org.springframework.stereotype.Service;

@Service
public class PaymentDetailsService {

    public PaymentDetailsService(BankAccount foundationAccount) {
    }

    public PaymentDetails details() {
        throw new UnsupportedOperationException("not yet");
    }
}
