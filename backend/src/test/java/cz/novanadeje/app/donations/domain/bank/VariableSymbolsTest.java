package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VariableSymbolsTest {

    @Test
    @DisplayName("Given a blank symbol, when it is matched, then the result is empty")
    void should_be_empty_when_matched_given_blank_symbol() {
        assertThat(VariableSymbols.forMatching(null)).isEmpty();
        assertThat(VariableSymbols.forMatching("   ")).isEmpty();
    }

    @Test
    @DisplayName("Given a padded symbol, when it is matched, then leading zeros are stripped")
    void should_strip_leading_zeros_when_matched_given_padded_symbol() {
        assertThat(VariableSymbols.forMatching("0004821937560")).contains(new VariableSymbol("4821937560"));
        assertThat(VariableSymbols.forMatching("0558")).contains(new VariableSymbol("558"));
    }

    @Test
    @DisplayName("Given surrounding spaces, when a symbol is matched, then they are trimmed")
    void should_trim_when_matched_given_surrounding_spaces() {
        assertThat(VariableSymbols.forMatching(" 4821937560 ")).contains(new VariableSymbol("4821937560"));
    }

    @Test
    @DisplayName("Given letters, when a symbol is matched, then the result is empty")
    void should_be_empty_when_matched_given_letters() {
        assertThat(VariableSymbols.forMatching("12A4")).isEmpty();
        assertThat(VariableSymbols.forMatching("12 34")).isEmpty();
    }

    @Test
    @DisplayName("Given eleven significant digits, when a symbol is matched, then the result is empty")
    void should_be_empty_when_matched_given_eleven_significant_digits() {
        assertThat(VariableSymbols.forMatching("12345678901")).isEmpty();
    }

    @Test
    @DisplayName("Given only zeros, when a symbol is matched, then the result is empty")
    void should_be_empty_when_matched_given_only_zeros() {
        assertThat(VariableSymbols.forMatching("0000")).isEmpty();
    }

    @Test
    @DisplayName("Given the literal symbol 0 that standing orders send, when matched, then there is no symbol to match")
    void should_be_empty_when_matched_given_single_zero() {
        assertThat(VariableSymbols.forMatching("0")).isEmpty();
    }

    @Test
    @DisplayName("Given a symbol of three zeros, when matched, then there is no symbol to match")
    void should_be_empty_when_matched_given_three_zeros() {
        assertThat(VariableSymbols.forMatching("000")).isEmpty();
    }
}
