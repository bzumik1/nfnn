package cz.novanadeje.app.donations.domain.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankNameTest {

    @Test
    @DisplayName("Given a name with spaces around it, when a bank name is made, then it is trimmed")
    void should_trim_when_made_given_surrounding_spaces() {
        assertThat(new BankName("  Česká spořitelna, a.s. ").value()).isEqualTo("Česká spořitelna, a.s.");
    }

    @Test
    @DisplayName("Given a name of exactly 120 characters, when a bank name is made, then it is accepted")
    void should_accept_when_made_given_longest_name() {
        assertThat(new BankName("x".repeat(BankName.MAX_LENGTH)).value()).hasSize(120);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "Banka\u0000", "Banka\nnová", "Banka\u007f", "Banka\u0085"})
    @DisplayName("Given an empty name or one with a control character, when a bank name is made, then it is refused")
    void should_refuse_when_made_given_empty_or_control_character(String value) {
        assertThatThrownBy(() -> new BankName(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a name longer than 120 characters or none, when a bank name is made, then it is refused")
    void should_refuse_when_made_given_too_long_or_null_name() {
        assertThatThrownBy(() -> new BankName("x".repeat(121))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BankName(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
