package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class ProblemMessagesTest {

    private static final String ONLY_IN_LANGUAGE_BUNDLES = "problem.operations/invalid-settings.title";

    private ProblemMessages texts;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        texts = new ProblemMessages(messages);
    }

    @Test
    @DisplayName("Given an English client, when a text is looked up, then it is the English one")
    void should_answer_english_text_when_looked_up_given_english_client() {
        assertThat(texts.text(ONLY_IN_LANGUAGE_BUNDLES, Locale.ENGLISH)).isEqualTo("The settings cannot be saved");
    }

    @Test
    @DisplayName("Given a language the site has no texts in, when a text only the language bundles hold is looked up, then it is the Czech one")
    void should_answer_czech_text_when_looked_up_given_language_without_texts() {
        assertThat(texts.text(ONLY_IN_LANGUAGE_BUNDLES, Locale.GERMAN)).isEqualTo("Nastavení nejde uložit");
        assertThat(texts.text(ONLY_IN_LANGUAGE_BUNDLES, Locale.forLanguageTag("sk-SK"))).isEqualTo("Nastavení nejde uložit");
    }

    @Test
    @DisplayName("Given a key no bundle holds, when it is looked up, then nothing is found and the fallback answers")
    void should_answer_fallback_when_looked_up_given_unknown_key() {
        assertThat(texts.find("problem.nfnn-no-such-key", Locale.GERMAN)).isEmpty();
        assertThat(texts.text("problem.nfnn-no-such-key", Locale.GERMAN, "Bad Request")).isEqualTo("Bad Request");
    }
}
