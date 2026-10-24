package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class BankAccountTest {

    private static final Iban IBAN = new Iban("CZ6508000000192000145399");

    @ParameterizedTest
    @ValueSource(strings = {"123456789/0800", "19-2000145399/0800", "2000145399/0800"})
    @DisplayName("Given a Czech account number with a bank code, when the account is created, then it is accepted")
    void should_accept_when_created_given_czech_account_number_with_bank_code(String accountNumber) {
        assertThat(new BankAccount(accountNumber, IBAN, "Nadační fond Nová naděje").accountNumber()).isEqualTo(accountNumber);
    }

    @Test
    @DisplayName("Given padded values, when the account is created, then they are trimmed")
    void should_trim_when_created_given_padded_values() {
        BankAccount account = new BankAccount(" 123456789/0800 ", IBAN, " Nadační fond Nová naděje ");

        assertThat(account.accountNumber()).isEqualTo("123456789/0800");
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
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount("123456789/0800", IBAN, " "));
    }

    @Test
    @DisplayName("Given no IBAN, when the account is created, then it is rejected")
    void should_reject_when_created_given_no_iban() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankAccount("123456789/0800", null, "Nadační fond Nová naděje"));
    }
}
