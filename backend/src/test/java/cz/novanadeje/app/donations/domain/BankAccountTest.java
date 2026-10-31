package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class BankAccountTest {

    private static final String ACCOUNT_NUMBER = "19-2000145399/0800";
    private static final Iban IBAN = new Iban("CZ6508000000192000145399");

    @ParameterizedTest
    @ValueSource(strings = {"5544332217/2010", "19-2000145399/0800", "2000145399/0800"})
    @DisplayName("Given a Czech account number with a bank code, when the account is created, then it is accepted")
    void should_accept_when_created_given_czech_account_number_with_bank_code(String accountNumber) {
        Iban iban = new CzechAccountNumber(accountNumber).toIban();

        assertThat(new BankAccount(accountNumber, iban, "Nadační fond Nová naděje").accountNumber()).isEqualTo(accountNumber);
    }

    @Test
    @DisplayName("Given padded values, when the account is created, then they are trimmed")
    void should_trim_when_created_given_padded_values() {
        BankAccount account = new BankAccount(" " + ACCOUNT_NUMBER + " ", IBAN, " Nadační fond Nová naděje ");

        assertThat(account.accountNumber()).isEqualTo(ACCOUNT_NUMBER);
        assertThat(account.recipientName()).isEqualTo("Nadační fond Nová naděje");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "123456789", "123456789/08", "abc/0800", "1234567-123/0800"})
    @DisplayName("Given a malformed account number, when the account is created, then it is rejected")
    void should_reject_when_created_given_malformed_account_number(String accountNumber) {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount(accountNumber, IBAN, "Nadační fond Nová naděje"));
    }

    @Test
    @DisplayName("Given a blank recipient name, when the account is created, then it is rejected")
    void should_reject_when_created_given_blank_recipient_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount(ACCOUNT_NUMBER, IBAN, " "));
    }

    @Test
    @DisplayName("Given no IBAN, when the account is created, then it is rejected")
    void should_reject_when_created_given_no_iban() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount(ACCOUNT_NUMBER, null, "Nadační fond Nová naděje"));
    }

    @Test
    @DisplayName("Given an IBAN of another account, when the account is created, then it is rejected, so the QR never pays an account the page does not show")
    void should_reject_when_created_given_an_iban_of_another_account() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new BankAccount("5544332217/2010", IBAN, "Nadační fond Nová naděje"))
                .withMessageContaining("5544332217/2010")
                .withMessageContaining(IBAN.value());
    }

    @Test
    @DisplayName("Given an account number that fails the modulo 11 check, when the account is created, then it is rejected")
    void should_reject_when_created_given_an_account_number_failing_the_modulo_11_check() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount("123456789/0800", IBAN, "Nadační fond Nová naděje"));
    }
}
