package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

class AdminPaymentViewTest {

    private static final LocalDate BOOKED_ON = LocalDate.of(2026, 10, 29);
    private static final Optional<SenderAccount> SENDER = SenderAccount.parse("2501234567", "2010");

    @Test
    @DisplayName("Given a 1 Kč payment announcing an account verification, when the administration reads it, then it is marked as an account verification")
    void should_be_account_verification_when_read_given_verification_payment() {
        AdminPaymentView view = new AdminPaymentView(
                payment(2001, BOOKED_ON, Money.czk(100), SENDER, "4821937560", "Ověření účtu Nadační fond Nová naděje"), Optional.empty());

        assertThat(view.accountVerification()).isTrue();
    }

    @Test
    @DisplayName("Given a gift with a message, when the administration reads it, then it is not an account verification")
    void should_not_be_account_verification_when_read_given_gift() {
        AdminPaymentView view = new AdminPaymentView(
                payment(2002, BOOKED_ON, Money.czk(50000), SENDER, "4821937560", "Ověření účtu Nadační fond Nová naděje"), Optional.empty());

        assertThat(view.accountVerification()).isFalse();
    }
}
