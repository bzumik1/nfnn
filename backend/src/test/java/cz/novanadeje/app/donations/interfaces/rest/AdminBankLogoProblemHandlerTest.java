package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class AdminBankLogoProblemHandlerTest {

    @AfterEach
    void tearDown() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    @DisplayName("Given every failure, when it is answered in Czech and in English, then each has its own detail")
    void should_have_detail_in_both_languages_when_answered_given_every_failure() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        for (BankLogoFailure failure : BankLogoFailure.values()) {
            for (Locale locale : new Locale[]{Locale.forLanguageTag("cs"), Locale.ENGLISH}) {
                LocaleContextHolder.setLocale(locale);
                ProblemDetail problem = new AdminBankLogoProblemHandler(messages).handleUnavailable(new BankLogoUnavailable(failure));
                assertThat(problem.getDetail()).as("%s in %s", failure, locale).isNotBlank().doesNotContain("problem.");
            }
        }
    }

    @Test
    @DisplayName("Given a logo the source would not give, when the failure is answered in English, then it is a 502 bank-logo-unavailable whose detail names the reason in words")
    void should_answer_bad_gateway_with_reason_when_unavailable_given_english_client() {
        LocaleContextHolder.setLocale(Locale.ENGLISH);
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        ProblemDetail problem = new AdminBankLogoProblemHandler(messages).handleUnavailable(new BankLogoUnavailable(BankLogoFailure.UNSUPPORTED_TYPE));

        assertThat(problem.getStatus()).isEqualTo(502);
        assertThat(problem.getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donations/bank-logo-unavailable"));
        assertThat(problem.getTitle()).isEqualTo(messages.getMessage("problem.donations/bank-logo-unavailable.title", null, Locale.ENGLISH));
        assertThat(problem.getDetail()).isEqualTo("The address holds no PNG or JPEG image. Nothing was saved and the current logo stays.");
        assertThat(problem.getProperties()).isNull();
    }
}
