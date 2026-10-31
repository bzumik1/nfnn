package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class CzechAccountNumberTest {

    @ParameterizedTest
    @CsvSource({
            "5544332217/2010, CZ2620100000005544332217",
            "19-2000145399/0800, CZ6508000000192000145399",
            "2000145399/0800, CZ7908000000002000145399",
            "19/0100, CZ7301000000000000000019"
    })
    @DisplayName("Given an account number that passes the modulo 11 check, when its IBAN is derived, then it is the bank code, the prefix and the number with their check digits")
    void should_derive_the_iban_when_derived_given_an_account_number_that_passes_the_check(String accountNumber, String iban) {
        assertThat(new CzechAccountNumber(accountNumber).toIban()).isEqualTo(new Iban(iban));
    }

    @Test
    @DisplayName("Given an account number with spaces around it, when it is created, then it keeps the number without them")
    void should_trim_when_created_given_spaces_around_the_number() {
        assertThat(new CzechAccountNumber(" 19-2000145399/0800 ").value()).isEqualTo("19-2000145399/0800");
    }

    @ParameterizedTest
    @ValueSource(strings = {"18-2000145399/0800", "2000145398/0800", "123456789/0800"})
    @DisplayName("Given a prefix or a number that fails the modulo 11 check, when the account number is created, then it is refused")
    void should_refuse_when_created_given_a_prefix_or_number_failing_the_modulo_11_check(String accountNumber) {
        assertThatIllegalArgumentException().isThrownBy(() -> new CzechAccountNumber(accountNumber));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0/0800", "19-0000000000/0800"})
    @DisplayName("Given a number of zeros, when the account number is created, then it is refused although zero passes the modulo 11 check")
    void should_refuse_when_created_given_a_number_of_zeros(String accountNumber) {
        assertThatIllegalArgumentException().isThrownBy(() -> new CzechAccountNumber(accountNumber));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "2000145399", "2000145399/800", "abc/0800", "1234567-2000145399/0800", "12345678901/0800"})
    @DisplayName("Given a text that is not [prefix-]number/bank code, when the account number is created, then it is refused")
    void should_refuse_when_created_given_a_malformed_text(String accountNumber) {
        assertThatIllegalArgumentException().isThrownBy(() -> new CzechAccountNumber(accountNumber));
    }

    @Test
    @DisplayName("Given no text, when the account number is created, then it is refused")
    void should_refuse_when_created_given_no_text() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CzechAccountNumber(null));
    }
}
