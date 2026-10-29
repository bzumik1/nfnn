package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QrPaymentTest {

    private static final BankAccount FOUNDATION = new BankAccount(
            "123456789/0800",
            new Iban("CZ65 0800 0000 1920 0014 5399"),
            "Nadační fond Nová naděje"
    );

    @Test
    @DisplayName("Given a donation that identifies the donor, when the payment is rendered, then the SPAYD carries the variable symbol")
    void should_render_spayd_with_variable_symbol_when_donation_identifies_the_donor() {
        QrPayment payment = QrPayment.donation(FOUNDATION, Money.czk(50_000), new VariableSymbol("1234567890"));

        assertThat(payment.toSpayd()).isEqualTo(
                "SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE");
    }

    @Test
    @DisplayName("Given an anonymous donation, when the payment is rendered, then the SPAYD leaves out the variable symbol")
    void should_leave_out_variable_symbol_when_donation_is_anonymous() {
        QrPayment payment = QrPayment.donation(FOUNDATION, Money.czk(100_000));

        assertThat(payment.toSpayd()).isEqualTo(
                "SPD*1.0*ACC:CZ6508000000192000145399*AM:1000.00*CC:CZK*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE");
        assertThat(payment.variableSymbol()).isEmpty();
    }

    @Test
    @DisplayName("Given an account verification, when the payment is rendered, then it says it verifies the account")
    void should_say_it_verifies_the_account_when_rendered_given_account_verification() {
        QrPayment payment = QrPayment.accountVerification(FOUNDATION, Money.czk(100), new VariableSymbol("1234567890"));

        assertThat(payment.toSpayd()).isEqualTo(
                "SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:OVERENI UCTU NADACNI FOND NOVA NADEJE");
        assertThat(payment.message()).isEqualTo(QrPaymentPurpose.ACCOUNT_VERIFICATION.message());
    }

    @Test
    @DisplayName("Given a second-factor recovery, when the payment is rendered, then it carries the recovery message and no variable symbol")
    void should_carry_the_recovery_message_and_no_variable_symbol_when_rendered_given_a_second_factor_recovery() {
        QrPayment payment = QrPayment.secondFactorRecovery(FOUNDATION, Money.czk(100), new SecondFactorRecoveryCode("ABCD2345"));

        assertThat(payment.toSpayd()).isEqualTo(
                "SPD*1.0*ACC:CZ6508000000192000145399*AM:1.00*CC:CZK*RN:NADACNI FOND NOVA NADEJE*MSG:OBNOVA ABCD2345");
        assertThat(payment.variableSymbol()).isEmpty();
        assertThat(SecondFactorRecoveryCode.findIn(payment.message())).contains(new SecondFactorRecoveryCode("ABCD2345"));
    }

    @Test
    @DisplayName("Given an account verification without a variable symbol, when the payment is created, then it is refused")
    void should_refuse_when_created_given_account_verification_without_variable_symbol() {
        assertThatThrownBy(() -> QrPayment.accountVerification(FOUNDATION, Money.czk(100), null))
                .isInstanceOf(VerificationNeedsVariableSymbol.class);
    }

    @Test
    @DisplayName("Given an amount with hellers, when the payment is rendered, then the amount has two decimals")
    void should_render_amount_with_two_decimals_when_amount_has_hellers() {
        assertThat(QrPayment.donation(FOUNDATION, Money.czk(12_345)).toSpayd()).contains("*AM:123.45*");
        assertThat(QrPayment.donation(FOUNDATION, Money.czk(100)).toSpayd()).contains("*AM:1.00*");
        assertThat(QrPayment.donation(FOUNDATION, Money.czk(100_000_000)).toSpayd()).contains("*AM:1000000.00*");
    }

    @Test
    @DisplayName("Given a recipient name with diacritics and punctuation, when the payment is rendered, then the name is uppercase ASCII")
    void should_write_recipient_name_in_uppercase_ascii_when_it_has_diacritics_and_punctuation() {
        BankAccount account = new BankAccount("123456789/0800", FOUNDATION.iban(), "Žluťoučký kůň, z. ú. *Ostrava*");

        assertThat(QrPayment.donation(account, Money.czk(100)).toSpayd()).contains("*RN:ZLUTOUCKY KUN Z. U. OSTRAVA*");
    }

    @Test
    @DisplayName("Given a longer recipient name, when the payment is rendered, then the name is shortened to 35 characters")
    void should_shorten_recipient_name_to_35_characters_when_it_is_longer() {
        BankAccount account = new BankAccount("123456789/0800", FOUNDATION.iban(), "Nadační fond Nová naděje pro děti a mládež v nouzi");

        assertThat(QrPayment.donation(account, Money.czk(100)).toSpayd()).contains("*RN:NADACNI FOND NOVA NADEJE PRO DETI A*");
    }

    @Test
    @DisplayName("Given any values, when the payment is rendered, then the SPAYD keeps to the allowed characters")
    void should_keep_spayd_within_the_allowed_characters_when_rendered() {
        assertThat(QrPayment.donation(FOUNDATION, Money.czk(50_000), new VariableSymbol("42")).toSpayd())
                .matches("[0-9A-Z $%*+\\-./:]+");
    }

    @Test
    @DisplayName("Given a donation that is not positive, when the payment is created, then it is rejected")
    void should_reject_when_donation_is_not_positive() {
        assertThatIllegalArgumentException().isThrownBy(() -> QrPayment.donation(FOUNDATION, Money.czk(0)));
        assertThatIllegalArgumentException().isThrownBy(() -> QrPayment.donation(FOUNDATION, Money.czk(-100)));
    }

    @Test
    @DisplayName("Given a donation that does not fit the SPAYD amount field, when the payment is created, then it is rejected")
    void should_reject_when_donation_does_not_fit_the_spayd_amount_field() {
        assertThatIllegalArgumentException().isThrownBy(() -> QrPayment.donation(FOUNDATION, Money.czk(1_000_000_000)));
    }

    @Test
    @DisplayName("Given no recipient, when the payment is created, then it is rejected")
    void should_reject_when_created_given_no_recipient() {
        assertThatIllegalArgumentException().isThrownBy(() -> QrPayment.donation(null, Money.czk(100)));
    }

    @Test
    @DisplayName("Given the same values, when two payments are created, then they are equal")
    void should_be_equal_when_created_from_the_same_values() {
        assertThat(QrPayment.donation(FOUNDATION, Money.czk(100), new VariableSymbol("7")))
                .isEqualTo(QrPayment.donation(FOUNDATION, Money.czk(100), new VariableSymbol("7")))
                .isNotEqualTo(QrPayment.donation(FOUNDATION, Money.czk(100)))
                .isNotEqualTo(QrPayment.accountVerification(FOUNDATION, Money.czk(100), new VariableSymbol("7")));
    }
}
