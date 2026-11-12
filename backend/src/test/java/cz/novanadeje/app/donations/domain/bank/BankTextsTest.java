package cz.novanadeje.app.donations.domain.bank;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class BankTextsTest {

    @Test
    @DisplayName("Given a text with NUL characters, when it is normalized, then they are removed")
    void should_remove_nul_characters_when_normalized_given_text_with_nul() {
        assertThat(BankTexts.normalized(Optional.of("Dar\u0000 pro\u0000 fond\u0000"), 500)).contains("Dar pro fond");
    }

    @Test
    @DisplayName("Given a text with control characters, when it is normalized, then every one but the tab, line feed and carriage return is removed")
    void should_remove_control_characters_but_line_breaks_and_tabs_when_normalized_given_control_characters() {
        String text = "A\u0001B\u0007C\u001bD\u001fE\u007fF\u0080G\u0085H\u009fI\tJ\nK\rL";

        assertThat(BankTexts.normalized(Optional.of(text), 500)).contains("ABCDEFGHI\tJ\nK\rL");
    }

    @Test
    @DisplayName("Given a text of only NUL characters and spaces, when it is normalized, then it becomes empty")
    void should_become_empty_when_normalized_given_only_nul_and_spaces() {
        assertThat(BankTexts.normalized(Optional.of(" \u0000 \u0000"), 500)).isEmpty();
    }

    @Test
    @DisplayName("Given a text cut to its width, when it is normalized, then the removed characters do not count")
    void should_not_count_removed_characters_when_normalized_given_width() {
        assertThat(BankTexts.normalized(Optional.of("AB\u0000\u0000\u0000CDE"), 5)).contains("ABCDE");
    }

    @Test
    @DisplayName("Given a required text with NUL characters, when it is taken, then they are removed")
    void should_remove_nul_characters_when_taken_given_required_text_with_nul() {
        assertThat(BankTexts.required("\u0000Bezhotovostní\u0000 příjem", 100, "Transaction type")).isEqualTo("Bezhotovostní příjem");
    }

    @Test
    @DisplayName("Given Czech text and typographic characters, when it is normalized, then it is kept as it is")
    void should_keep_text_when_normalized_given_czech_and_typographic_characters() {
        assertThat(BankTexts.normalized(Optional.of("Dar – Nováková Jana „fond“ €"), 500)).contains("Dar – Nováková Jana „fond“ €");
    }
}
