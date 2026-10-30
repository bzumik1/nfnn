package cz.novanadeje.app.content.domain.people;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FoundersNoteTest {

    private static final Instant NOW = Instant.parse("2026-10-30T09:00:00Z");

    @Test
    @DisplayName("Given a text with spaces around, Windows line ends and many empty lines, when the note is made, then it is trimmed and its paragraphs are kept apart by one empty line")
    void should_normalise_the_paragraphs_when_made_given_untidy_text() {
        FoundersNote note = new FoundersNote(Optional.of("  První odstavec.  \r\n\r\n\r\n\r\nDruhý odstavec.\r\nPokračuje.  "), NOW);

        assertThat(note.text()).contains("První odstavec.\n\nDruhý odstavec.\nPokračuje.");
    }

    @Test
    @DisplayName("Given a blank text, when the note is made, then it has no text")
    void should_have_no_text_when_made_given_a_blank_text() {
        assertThat(new FoundersNote(Optional.of(" \n "), NOW).text()).isEmpty();
    }

    @Test
    @DisplayName("Given a text of 601 characters, when the note is made, then it is refused, and 600 characters pass")
    void should_refuse_the_text_when_made_given_more_than_600_characters() {
        String longest = "x".repeat(FoundersNote.MAX_LENGTH);

        assertThat(new FoundersNote(Optional.of(longest), NOW).text()).contains(longest);
        assertThatThrownBy(() -> new FoundersNote(Optional.of(longest + "x"), NOW)).isInstanceOf(IllegalArgumentException.class);
    }
}
