package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

class DonationPurposeTest {

    private static final LocalDate BOOKED_ON = LocalDate.of(2026, 10, 15);
    private static final Optional<SenderAccount> SENDER = SenderAccount.parse("2900233333", "2010");

    @ParameterizedTest
    @ValueSource(strings = {
            "OVERENI UCTU NADACNI FOND NOVA NADEJE",
            "Ověření účtu Nadační fond Nová naděje",
            "overeni  uctu",
            "OVERENI UCTU NADACNI FOND NOV"
    })
    @DisplayName("Given a 1 Kč payment whose message announces an account verification, when its purpose is read, then it is the account verification")
    void should_be_account_verification_when_read_given_verification_message(String message) {
        assertThat(DonationPurpose.of(payment(1001, BOOKED_ON, Money.czk(100), SENDER, "4821937560", message)))
                .isEqualTo(DonationPurpose.ACCOUNT_VERIFICATION);
    }

    @ParameterizedTest
    @ValueSource(strings = {"DAR NADACNI FOND NOVA NADEJE", "Pro děti", "ověření"})
    @DisplayName("Given a payment with another message, when its purpose is read, then it is the general purpose")
    void should_be_general_when_read_given_other_message(String message) {
        assertThat(DonationPurpose.of(payment(1001, BOOKED_ON, Money.czk(100), SENDER, "4821937560", message)))
                .isEqualTo(DonationPurpose.GENERAL);
    }

    @ParameterizedTest
    @ValueSource(longs = {99, 101, 50000})
    @DisplayName("Given a payment announcing an account verification with another amount than 1 Kč, when its purpose is read, then it is the general purpose")
    void should_be_general_when_read_given_verification_message_with_other_amount(long amountMinor) {
        assertThat(DonationPurpose.of(payment(1001, BOOKED_ON, Money.czk(amountMinor), SENDER, "4821937560",
                "OVERENI UCTU NADACNI FOND NOVA NADEJE")))
                .isEqualTo(DonationPurpose.GENERAL);
    }

    @Test
    @DisplayName("Given a 1 Kč payment without a message, when its purpose is read, then it is the general purpose")
    void should_be_general_when_read_given_no_message() {
        assertThat(DonationPurpose.of(payment(1001, BOOKED_ON, Money.czk(100), SENDER, "4821937560")))
                .isEqualTo(DonationPurpose.GENERAL);
    }
}
