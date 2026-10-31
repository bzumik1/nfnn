package cz.novanadeje.app.donations.domain.payment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SpaydTextTest {

    @Test
    @DisplayName("Given a Czech text, when it becomes SPAYD text, then it is uppercase ASCII without diacritics")
    void should_write_uppercase_ascii_when_made_given_a_czech_text() {
        assertThat(SpaydText.message("Dar Nadační fond Nová naděje").value()).isEqualTo("DAR NADACNI FOND NOVA NADEJE");
    }

    @Test
    @DisplayName("Given a percent sign, a star, an ampersand and a comma, when a name becomes SPAYD text, then each is a space and the spaces collapse")
    void should_replace_percent_star_and_other_symbols_with_spaces_when_made_given_a_name_with_symbols() {
        assertThat(SpaydText.recipientName("Žluťoučký kůň 100% + *hvězda* & spol.").value()).isEqualTo("ZLUTOUCKY KUN 100 + HVEZDA SPOL.");
    }

    @Test
    @DisplayName("Given the characters a SPAYD value keeps, when a text becomes SPAYD text, then they stay")
    void should_keep_the_alphanumeric_symbols_when_made_given_them_in_a_text() {
        assertThat(SpaydText.message("a $ b + c - d . e / f : g").value()).isEqualTo("A $ B + C - D . E / F : G");
    }

    @Test
    @DisplayName("Given a name of exactly 35 characters, when it becomes SPAYD text, then it is kept whole")
    void should_keep_the_whole_name_when_made_given_exactly_35_characters() {
        String name = "Spolek rodičů při škole Tišnov 1234";

        assertThat(name).hasSize(SpaydText.RECIPIENT_NAME_LENGTH);
        assertThat(SpaydText.recipientName(name).value()).isEqualTo("SPOLEK RODICU PRI SKOLE TISNOV 1234");
    }

    @Test
    @DisplayName("Given a name longer than 35 characters, when it becomes SPAYD text, then it is cut at 35 and loses a space the cut leaves at its end")
    void should_cut_at_35_and_trim_when_made_given_a_longer_name() {
        assertThat(SpaydText.recipientName("Nadační fond Nová naděje pro děti a mládež z Tišnova").value())
                .isEqualTo("NADACNI FOND NOVA NADEJE PRO DETI A");
        assertThat(SpaydText.recipientName("Spolek rodičů při škole Tišnov 123 Brno").value())
                .isEqualTo("SPOLEK RODICU PRI SKOLE TISNOV 123");
    }

    @Test
    @DisplayName("Given a message of exactly 60 characters, when it becomes SPAYD text, then it is kept whole, and one more character is cut")
    void should_keep_60_and_cut_the_61st_when_made_given_a_message() {
        String sixty = "OVERENI UCTU NADACNI FOND NOVA NADEJE PRO DETI A MLADEZ 1234";

        assertThat(sixty).hasSize(SpaydText.MESSAGE_LENGTH);
        assertThat(SpaydText.message(sixty).value()).isEqualTo(sixty);
        assertThat(SpaydText.message(sixty + "5").value()).isEqualTo(sixty);
    }

    @Test
    @DisplayName("Given a text of symbols only, when it becomes SPAYD text, then it is empty")
    void should_be_empty_when_made_given_symbols_only() {
        SpaydText text = SpaydText.recipientName("*** & %%%");

        assertThat(text.value()).isEmpty();
        assertThat(text.isEmpty()).isTrue();
        assertThat(SpaydText.message("DAR").isEmpty()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"dar", "DAR*VS", "DAR%20", " DAR", "DAR ", "DAR  FOND", "ÚČET"})
    @DisplayName("Given a value that is not SPAYD text, when it is created as such, then it is refused")
    void should_refuse_when_created_given_a_value_outside_spayd_text(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> new SpaydText(value));
    }

    @Test
    @DisplayName("Given a value over 60 characters, when it is created as SPAYD text, then it is refused")
    void should_refuse_when_created_given_more_than_60_characters() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SpaydText("A".repeat(SpaydText.MESSAGE_LENGTH + 1)));
    }

    @Test
    @DisplayName("Given no text, when it becomes SPAYD text, then it is refused")
    void should_refuse_when_made_given_no_text() {
        assertThatIllegalArgumentException().isThrownBy(() -> SpaydText.message(null));
        assertThatIllegalArgumentException().isThrownBy(() -> new SpaydText(null));
    }
}
