package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.bank.BankPayment;

import java.util.Optional;

public record AdminPaymentView(BankPayment payment, Optional<PairedDonationView> donation) {

    public AdminPaymentView {
        if (payment == null || donation == null) {
            throw new IllegalArgumentException("An admin payment view needs the payment and its donation (even when absent)");
        }
    }
}
