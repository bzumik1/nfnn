package cz.novanadeje.app.content.domain.people;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PeopleFootnoteTest {

    private static final Instant NOW = Instant.parse("2026-10-31T09:00:00Z");

    @Test
    @DisplayName("Given a text with spaces around, runs of spaces and line ends, when the footnote is made, then it is one trimmed line with single spaces")
    void should_make_one_line_when_made_given_untidy_text() {
        PeopleFootnote footnote = new PeopleFootnote(Optional.of("  Web zajišťuje \t bez nároku\r\n\r\nna odměnu Petr Vzor.  "), NOW);

        assertThat(footnote.text()).contains("Web zajišťuje bez nároku na odměnu Petr Vzor.");
    }

    @Test
    @DisplayName("Given a blank text, when the footnote is made, then it has no text")
    void should_have_no_text_when_made_given_a_blank_text() {
        assertThat(new PeopleFootnote(Optional.of(" \n "), NOW).text()).isEmpty();
    }

    @Test
    @DisplayName("Given a text of 201 characters, when the footnote is made, then it is refused, and 200 characters pass")
    void should_refuse_the_text_when_made_given_more_than_200_characters() {
        String longest = "x".repeat(PeopleFootnote.MAX_LENGTH);

        assertThat(new PeopleFootnote(Optional.of(longest), NOW).text()).contains(longest);
        assertThatThrownBy(() -> new PeopleFootnote(Optional.of(longest + "x"), NOW)).isInstanceOf(IllegalArgumentException.class);
    }
}
