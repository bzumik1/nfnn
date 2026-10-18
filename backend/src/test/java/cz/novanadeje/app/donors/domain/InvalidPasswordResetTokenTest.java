package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class InvalidPasswordResetTokenTest {

    private static final String TITLE = "problem.donors/invalid-password-reset-token.title";
    private static final String DETAIL = "problem.donors/invalid-password-reset-token.detail";

    @Test
    @DisplayName("Given an invalid reset token, when the exception is raised, then it is a rule violation with its own code")
    void should_be_rule_violation_with_code_when_raised() {
        InvalidPasswordResetToken invalid = new InvalidPasswordResetToken();

        assertThat(invalid).isInstanceOf(RuleViolation.class);
        assertThat(invalid.code()).isEqualTo("donors/invalid-password-reset-token");
    }

    @Test
    @DisplayName("Given the message bundles, when the problem texts are read, then Czech is the default and English is translated")
    void should_have_czech_and_english_texts_when_bundles_read() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        assertThat(messages.getMessage(TITLE, null, Locale.ROOT)).isEqualTo("Odkaz pro obnovu hesla je neplatný nebo vypršel");
        assertThat(messages.getMessage(DETAIL, null, Locale.ROOT)).isEqualTo("Požádejte prosím o nový odkaz.");
        assertThat(messages.getMessage(TITLE, null, Locale.forLanguageTag("cs"))).isEqualTo("Odkaz pro obnovu hesla je neplatný nebo vypršel");
        assertThat(messages.getMessage(DETAIL, null, Locale.forLanguageTag("cs"))).isEqualTo("Požádejte prosím o nový odkaz.");
        assertThat(messages.getMessage(TITLE, null, Locale.ENGLISH)).isEqualTo("The password reset link is invalid or has expired");
        assertThat(messages.getMessage(DETAIL, null, Locale.ENGLISH)).isEqualTo("Please request a new link.");
    }
}
