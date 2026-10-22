package cz.novanadeje.app.donations;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class DonationMessagesTest {

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"problem.donations/receipt-before-first-year.title", "problem.donations/receipt-before-first-year.detail",
            "problem.donations/symbol-offer-not-available.title", "problem.donations/symbol-offer-not-available.detail",
            "problem.donations/symbol-claim-already-answered.title", "problem.donations/symbol-claim-already-answered.detail",
            "donations.symbolClaim.variableSymbol.invalid"})
    @DisplayName("Given a request in a language without its own bundle, when a receipt year or symbol claim text is read, then it is the Czech text")
    void should_read_czech_text_when_read_given_language_without_bundle(String key) {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        assertThat(messages.getMessage(key, null, Locale.GERMAN)).isEqualTo(messages.getMessage(key, null, Locale.forLanguageTag("cs")));
    }
}
