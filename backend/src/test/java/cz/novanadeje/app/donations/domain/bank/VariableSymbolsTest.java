package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VariableSymbolsTest {

    @Test
    void should_be_empty_when_matched_given_blank_symbol() {
        assertThat(VariableSymbols.forMatching(null)).isEmpty();
        assertThat(VariableSymbols.forMatching("   ")).isEmpty();
    }

    @Test
    void should_strip_leading_zeros_when_matched_given_padded_symbol() {
        assertThat(VariableSymbols.forMatching("0004821937560")).contains(new VariableSymbol("4821937560"));
        assertThat(VariableSymbols.forMatching("0558")).contains(new VariableSymbol("558"));
    }

    @Test
    void should_trim_when_matched_given_surrounding_spaces() {
        assertThat(VariableSymbols.forMatching(" 4821937560 ")).contains(new VariableSymbol("4821937560"));
    }

    @Test
    void should_be_empty_when_matched_given_letters() {
        assertThat(VariableSymbols.forMatching("12A4")).isEmpty();
        assertThat(VariableSymbols.forMatching("12 34")).isEmpty();
    }

    @Test
    void should_be_empty_when_matched_given_eleven_significant_digits() {
        assertThat(VariableSymbols.forMatching("12345678901")).isEmpty();
    }

    @Test
    void should_be_empty_when_matched_given_only_zeros() {
        assertThat(VariableSymbols.forMatching("0000")).isEmpty();
    }
}
