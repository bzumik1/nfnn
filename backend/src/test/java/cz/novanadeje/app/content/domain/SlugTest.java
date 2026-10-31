package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SlugTest {

    @ParameterizedTest
    @CsvSource({
            "Pomohli jsme Dominikovi získat nový vozík, pomohli-jsme-dominikovi-ziskat-novy-vozik",
            "  Výroční zpráva 2025 je k dispozici!  , vyrocni-zprava-2025-je-k-dispozici",
            "Čau — co je nového?, cau-co-je-noveho",
            "ŘEŽ, rez",
    })
    @DisplayName("Given a Czech title, when a slug is made from it, then diacritics and punctuation become plain hyphenated ASCII")
    void should_strip_diacritics_when_made_from_text_given_a_czech_title(String title, String expected) {
        assertThat(Slug.fromText(title)).isEqualTo(new Slug(expected));
    }

    @Test
    @DisplayName("Given a very long title, when a slug is made, then it is cut to 80 characters without a trailing hyphen")
    void should_cut_to_max_length_when_made_from_text_given_a_long_title() {
        String title = "slovo ".repeat(30);

        Slug slug = Slug.fromText(title);

        assertThat(slug.value()).hasSizeLessThanOrEqualTo(Slug.MAX_LENGTH).doesNotEndWith("-");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "???", "Pomohli-Jsme", "a--b", "-a", "a-", "ab c"})
    @DisplayName("Given text that gives no slug or a malformed slug, when a slug is built, then it is refused")
    void should_refuse_when_built_given_a_malformed_value(String value) {
        assertThatThrownBy(() -> new Slug(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given only punctuation, when a slug is made from it, then there is none")
    void should_refuse_when_made_from_text_given_only_punctuation() {
        assertThatThrownBy(() -> Slug.fromText("?!…"))
                .isInstanceOf(RuleViolation.class).hasFieldOrPropertyWithValue("code", "content/slug-not-derivable");
    }
}
