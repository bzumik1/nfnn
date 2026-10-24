package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class IbanTest {

    @Test
    @DisplayName("Given a spaced lowercase IBAN, when it is created, then it keeps the compact uppercase form")
    void should_keep_compact_uppercase_form_when_created_given_spaced_lowercase_iban() {
        assertThat(new Iban("cz65 0800 0000 1920 0014 5399").value()).isEqualTo("CZ6508000000192000145399");
    }

    @ParameterizedTest
    @ValueSource(strings = {"CZ6508000000192000145399", "DE89370400440532013000", "GB82WEST12345698765432", "SK3112000000198742637541"})
    @DisplayName("Given an IBAN with matching check digits, when it is created, then it is accepted")
    void should_accept_when_created_given_iban_with_matching_check_digits(String iban) {
        assertThat(new Iban(iban).value()).isEqualTo(iban);
    }

    @Test
    @DisplayName("Given wrong check digits, when the IBAN is created, then it is rejected")
    void should_reject_when_created_given_wrong_check_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new Iban("CZ6608000000192000145399"));
    }

    @Test
    @DisplayName("Given a mistyped account digit, when the IBAN is created, then it is rejected")
    void should_reject_when_created_given_mistyped_account_digit() {
        assertThatIllegalArgumentException().isThrownBy(() -> new Iban("CZ6508000000192000145398"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "CZ65", "6508000000192000145399CZ", "CZ65-0800-0000-1920-0014-5399", "CZ650800000019200014539912345678901234"})
    @DisplayName("Given a malformed IBAN, when it is created, then it is rejected")
    void should_reject_when_created_given_malformed_iban(String iban) {
        assertThatIllegalArgumentException().isThrownBy(() -> new Iban(iban));
    }

    @Test
    @DisplayName("Given no value, when the IBAN is created, then it is rejected")
    void should_reject_when_created_given_no_value() {
        assertThatIllegalArgumentException().isThrownBy(() -> new Iban(null));
    }
}
