package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;

import java.util.Optional;

public record AdminPaymentView(BankPayment payment, Optional<PairedDonationView> donation, String version) {

    public AdminPaymentView {
        if (payment == null || donation == null || version == null) {
            throw new IllegalArgumentException("An admin payment view needs the payment, its donation (even when absent) and its version");
        }
    }

    public boolean accountVerification() {
        return DonationPurpose.of(payment) == DonationPurpose.ACCOUNT_VERIFICATION;
    }
}
