package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.ProblemDetail;

import java.time.YearMonth;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class AdminReportProblemHandlerTest {

    @AfterEach
    void tearDown() {
        LocaleContextHolder.resetLocaleContext();
    }

    @Test
    @DisplayName("Given a client in a language the site has no texts in, when an undelivered report is answered, then the problem is in Czech")
    void should_answer_in_czech_when_undelivered_report_answered_given_language_without_texts() {
        LocaleContextHolder.setLocale(Locale.forLanguageTag("sk-SK"));
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        ProblemDetail problem = new AdminReportProblemHandler(messages)
                .handleNotDelivered(new MonthlyReportNotDelivered(new ReportMonth(YearMonth.of(2026, 9)), new IllegalStateException("refused")));

        assertThat(problem.getStatus()).isEqualTo(502);
        assertThat(problem.getTitle()).isEqualTo(messages.getMessage("problem.donations/report-not-delivered.title", null, Locale.forLanguageTag("cs")));
        assertThat(problem.getDetail()).isEqualTo(messages.getMessage("problem.donations/report-not-delivered.detail", null, Locale.forLanguageTag("cs")));
    }
}
