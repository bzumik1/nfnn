package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class VariableSymbolTest {

    @ParameterizedTest
    @ValueSource(strings = {"7", "2025", "1234567890", "0000000042"})
    @DisplayName("Given one to ten digits, when the symbol is created, then it is accepted")
    void should_accept_when_created_given_one_to_ten_digits(String digits) {
        assertThat(new VariableSymbol(digits).value()).isEqualTo(digits);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "12345678901", "12A", "12 34", "-1"})
    @DisplayName("Given anything but one to ten digits, when the symbol is created, then it is rejected")
    void should_reject_when_created_given_anything_but_one_to_ten_digits(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> new VariableSymbol(value));
    }

    @Test
    @DisplayName("Given no value, when the symbol is created, then it is rejected")
    void should_reject_when_created_given_no_value() {
        assertThatIllegalArgumentException().isThrownBy(() -> new VariableSymbol(null));
    }

    @Test
    @DisplayName("Given ten and eleven digits, when checked against the published format outside the domain, then only ten digits match")
    void should_match_the_published_format_when_validated_outside_the_domain() {
        assertThat("1234567890").matches(VariableSymbol.FORMAT);
        assertThat("12345678901").doesNotMatch(VariableSymbol.FORMAT);
    }

    @RepeatedTest(20)
    @DisplayName("Given nothing, when a symbol is generated, then it has ten digits and starts with a non-zero one")
    void should_have_ten_digits_starting_with_nonzero_when_generated() {
        assertThat(VariableSymbol.random(new SecureRandom()).value()).matches("[1-9][0-9]{9}");
    }
}
