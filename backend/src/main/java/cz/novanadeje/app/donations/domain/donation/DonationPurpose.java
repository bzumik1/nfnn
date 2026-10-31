package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.shared.domain.Money;

import java.text.Normalizer;
import java.util.Locale;

public enum DonationPurpose {
    GENERAL,
    ACCOUNT_VERIFICATION;

    private static final String VERIFICATION_MARK = "OVERENI UCTU";
    public static final Money VERIFICATION_AMOUNT = Money.czk(100);

    public static DonationPurpose of(BankPayment payment) {
        if (!payment.amount().equals(VERIFICATION_AMOUNT)) {
            return GENERAL;
        }
        return payment.messageForRecipient()
                .filter(message -> plain(message).contains(VERIFICATION_MARK))
                .map(message -> ACCOUNT_VERIFICATION)
                .orElse(GENERAL);
    }

    private static String plain(String message) {
        return Normalizer.normalize(message, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("\\s+", " ")
                .toUpperCase(Locale.ROOT);
    }
}
