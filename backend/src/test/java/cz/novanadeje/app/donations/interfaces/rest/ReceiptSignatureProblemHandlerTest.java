package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.ProblemDetail;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSignatureProblemHandlerTest {

    private static final Locale CZECH = Locale.forLanguageTag("cs");

    private final ResourceBundleMessageSource messages = messages();
    private final ReceiptSignatureProblemHandler handler = new ReceiptSignatureProblemHandler(messages);

    @AfterEach
    void resetLocale() {
        LocaleContextHolder.resetLocaleContext();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(SignatureVectorProblem.class)
    @DisplayName("Given each problem of an SVG signature, when it is answered in Czech and in English, then the field error has its own text in both")
    void should_answer_own_text_in_both_languages_when_answered_given_each_problem(SignatureVectorProblem problem) {
        List<String> texts = List.of(CZECH, Locale.ENGLISH).stream()
                .map(locale -> fieldError(handle(new UnsupportedSignatureVector(problem, "script"), locale)).get("message"))
                .toList();

        assertThat(texts).doesNotHaveDuplicates().allSatisfy(text -> assertThat(text).isNotBlank().doesNotContain("donations."));
    }

    @Test
    @DisplayName("Given a refused element, when it is answered, then the problem names the file field, the problem's code and the element")
    void should_name_field_code_and_element_when_answered_given_refused_element() {
        ProblemDetail problem = handle(new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT, "foreignObject"), CZECH);

        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getType().toString()).endsWith("/donations/unsupported-signature-vector");
        assertThat(problem.getTitle()).isEqualTo("SVG nejde použít jako podpis");
        assertThat(problem.getDetail()).isEqualTo("Soubor obsahuje nepovolený prvek „foreignObject“. Ručně psaný podpis v SVG jde, když jsou jeho tahy "
                + "převedené na vyplněné tvary (path); obrysy s nastavenou tloušťkou čáry (stroke) a efekty web nepřijme a soubor smí mít nejvýš 200 kB. "
                + "Místo něj můžete nahrát sken JPEG, PNG nebo WebP.");
        assertThat(fieldError(problem)).containsExactlyInAnyOrderEntriesOf(Map.of(
                "field", "file", "code", "element", "message", "Soubor obsahuje nepovolený prvek „foreignObject“."));
    }

    @Test
    @DisplayName("Given a refused element, when it is answered in English, then the detail gives the reason first and then the alternative")
    void should_give_reason_first_when_answered_in_english_given_refused_element() {
        ProblemDetail problem = handle(new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT, "script"), Locale.ENGLISH);

        assertThat(problem.getTitle()).isEqualTo("The SVG cannot be used as a signature");
        assertThat(problem.getDetail()).isEqualTo("The file holds the element “script”, which is not allowed. A handwritten signature in SVG is fine when "
                + "its strokes are converted to filled shapes (path); outlines with a set line width (stroke) and effects are refused, and the file may "
                + "have at most 200 kB. You can upload a scan as a JPEG, PNG or WebP image instead.");
    }

    @Test
    @DisplayName("Given a refusal without a name, when it is answered, then its text has no placeholder left")
    void should_leave_no_placeholder_when_answered_given_refusal_without_name() {
        ProblemDetail problem = handle(new UnsupportedSignatureVector(SignatureVectorProblem.TOO_LARGE), CZECH);

        assertThat(fieldError(problem).get("message")).isEqualTo("Soubor je větší než 200 kB.");
    }

    private ProblemDetail handle(UnsupportedSignatureVector refused, Locale locale) {
        LocaleContextHolder.setLocale(locale);
        return handler.handleUnsupportedVector(refused);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> fieldError(ProblemDetail problem) {
        List<Map<String, String>> errors = (List<Map<String, String>>) problem.getProperties().get("errors");
        assertThat(errors).hasSize(1);
        return errors.getFirst();
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }
}
