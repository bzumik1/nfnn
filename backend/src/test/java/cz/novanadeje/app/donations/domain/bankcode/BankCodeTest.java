package cz.novanadeje.app.donations.domain.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeTest {

    @Test
    @DisplayName("Given four digits, when a bank code is made, then it keeps them")
    void should_keep_digits_when_made_given_four_digits() {
        assertThat(new BankCode("0800").value()).isEqualTo("0800");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "800", "08000", "08a0", " 0800", "０８００"})
    @DisplayName("Given anything but exactly four ASCII digits, when a bank code is made, then it is refused")
    void should_refuse_when_made_given_not_four_digits(String value) {
        assertThatThrownBy(() -> new BankCode(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no value, when a bank code is made, then it is refused")
    void should_refuse_when_made_given_null_code() {
        assertThatThrownBy(() -> new BankCode(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
