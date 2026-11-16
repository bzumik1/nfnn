package cz.novanadeje.app.donations.domain.recovery;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class NameWordsTest {

    @ParameterizedTest
    @ValueSource(strings = {"Jana Nováková", "NOVAKOVA JANA", "nováková   jana", "Nováková, Jana", "Ing. Jana Nováková, Ph.D.",
            "MUDr. et MUDr. Jana Nováková", "Mgr.Jana Nováková DiS.", "Bc. Jana Nováková, MBA", "JUDr. Nováková Jana, CSc.",
            "Ing. arch. Jana Nováková", "Jana Nováková Ph. D.", "prof. RNDr. Jana Nováková, DrSc."})
    @DisplayName("Given the bank's name of the payer in another case, order, accents, punctuation or with titles, when compared with the donor's name, then it is the same name")
    void should_be_the_same_name_when_compared_given_case_order_accents_punctuation_or_titles(String payerName) {
        assertThat(NameWords.of(payerName)).isEqualTo(NameWords.of("Jana Nováková"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"Jana Nováková Svobodová", "Nováková", "Jana Novakova Novakova", "Petr Novák", "Jana Novakovà Dvořák",
            "Jana Novákova1", "Jana Novákovás"})
    @DisplayName("Given a payer name with a word more, a word less, a repeated or another word, when compared with the donor's name, then it is another name")
    void should_be_another_name_when_compared_given_a_word_more_less_repeated_or_different(String payerName) {
        assertThat(NameWords.of(payerName)).isNotEqualTo(NameWords.of("Jana Nováková"));
    }

    @Test
    @DisplayName("Given a text without any letter or digit, or only titles, when read as name words, then there is no name")
    void should_have_no_name_when_read_given_no_letters_or_only_titles() {
        assertThat(NameWords.of("")).isEmpty();
        assertThat(NameWords.of("  ,. - ")).isEmpty();
        assertThat(NameWords.of("Ing. Ph.D.")).isEmpty();
    }

    @Test
    @DisplayName("Given a company's name with its legal form written in several ways, when compared, then the legal form is a word like any other")
    void should_compare_the_legal_form_as_a_word_when_compared_given_a_company() {
        assertThat(NameWords.of("STAVBY NOVAK S R O")).isEqualTo(NameWords.of("Stavby Novák s.r.o."));
        assertThat(NameWords.of("Stavby Novák, s. r. o.")).isEqualTo(NameWords.of("Stavby Novák s.r.o."));
        assertThat(NameWords.of("Stavby Novák sro")).isEqualTo(NameWords.of("Stavby Novák s.r.o."));
        assertThat(NameWords.of("Stavby Novák")).isNotEqualTo(NameWords.of("Stavby Novák s.r.o."));
        assertThat(NameWords.of("Stavby Novák a.s.")).isNotEqualTo(NameWords.of("Stavby Novák s.r.o."));
    }

    @Test
    @DisplayName("Given a single initial in the name, when compared, then the initials of both names are compared as written")
    void should_compare_initials_as_written_when_compared_given_initials() {
        assertThat(NameWords.of("Jana K. Nováková")).isEqualTo(NameWords.of("NOVAKOVA JANA K"));
        assertThat(NameWords.of("Jana K. Nováková")).isNotEqualTo(NameWords.of("Jana Nováková"));
    }
}
