package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.ProblemDetail;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsProblemHandlerTest {

    @AfterEach
    void tearDown() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    @DisplayName("Given a client in a language the site has no texts in, when refused settings are answered, then the problem and its errors are in Czech")
    void should_answer_in_czech_when_refused_settings_answered_given_language_without_texts() {
        LocaleContextHolder.setLocale(Locale.GERMAN);

        ProblemDetail problem = handler().handleRejected(new SettingsRejected(List.of(SettingError.ofWhole(SettingProblem.UNKNOWN_SETTING))));

        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getTitle()).isEqualTo("Nastavení nejde uložit");
        assertThat(problem.getDetail()).isEqualTo("Opravte označené hodnoty a uložte znovu.");
        assertThat(problem.getProperties()).containsEntry("errors",
                List.of(Map.of("field", "", "code", "unknown-setting", "message", "Takové nastavení web nezná.")));
    }

    @Test
    @DisplayName("Given an English client, when refused settings are answered, then the problem and its errors are in English")
    void should_answer_in_english_when_refused_settings_answered_given_english_client() {
        LocaleContextHolder.setLocale(Locale.ENGLISH);

        ProblemDetail problem = handler().handleRejected(new SettingsRejected(List.of(SettingError.ofWhole(SettingProblem.UNKNOWN_SETTING))));

        assertThat(problem.getTitle()).isEqualTo("The settings cannot be saved");
    }

    private static SettingsProblemHandler handler() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return new SettingsProblemHandler(messages);
    }
}
