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

    @Test
    @DisplayName("Given a message with a ten-digit number, when a symbol is looked for in it, then that number is the symbol")
    void should_find_symbol_when_looked_for_given_message_with_ten_digits() {
        assertThat(VariableSymbols.inMessage("VS 4821937560 dar")).contains(new VariableSymbol("4821937560"));
        assertThat(VariableSymbols.inMessage("4821937560")).contains(new VariableSymbol("4821937560"));
        assertThat(VariableSymbols.inMessage("VS:4821937560, 4821937560")).contains(new VariableSymbol("4821937560"));
    }

    @Test
    @DisplayName("Given a message without exactly one ten-digit number, when a symbol is looked for in it, then there is none")
    void should_find_nothing_when_looked_for_given_message_without_one_ten_digit_number() {
        assertThat(VariableSymbols.inMessage(null)).isEmpty();
        assertThat(VariableSymbols.inMessage("DAR NADACNI FOND NOVA NADEJE")).isEmpty();
        assertThat(VariableSymbols.inMessage("faktura 482193756")).isEmpty();
        assertThat(VariableSymbols.inMessage("tel 420482193756")).isEmpty();
        assertThat(VariableSymbols.inMessage("4821937560 a 7310945528")).isEmpty();
        assertThat(VariableSymbols.inMessage("0482193756")).isEmpty();
    }

    @Test
    @DisplayName("Given a message with an account number, when a symbol is looked for in it, then the account number is not taken for one")
    void should_find_nothing_when_looked_for_given_account_number_in_message() {
        assertThat(VariableSymbols.inMessage("z uctu 2400111222/2010")).isEmpty();
        assertThat(VariableSymbols.inMessage("z uctu 670100-2201234567/6210")).isEmpty();
        assertThat(VariableSymbols.inMessage("z uctu 19-2400111222")).isEmpty();
    }
}
