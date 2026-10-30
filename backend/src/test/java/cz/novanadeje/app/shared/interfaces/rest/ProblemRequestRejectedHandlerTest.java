package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class ProblemRequestRejectedHandlerTest {

    private static final String CLIENT_VALUE = "nfnn-client-value";

    private ProblemRequestRejectedHandler handler;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        AcceptHeaderLocaleResolver locales = new AcceptHeaderLocaleResolver();
        locales.setDefaultLocale(Locale.forLanguageTag("cs"));
        handler = new ProblemRequestRejectedHandler(messages, locales);
    }

    @Test
    @DisplayName("Given a request the firewall rejects, when it is answered, then the answer is a stored-nowhere validation problem in Czech without the address or the reason")
    void should_answer_validation_problem_without_address_when_answered_given_rejected_request() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/content/news;" + CLIENT_VALUE);
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.handle(request, response, new RequestRejectedException("The request was rejected because the URL contained ';' " + CLIENT_VALUE));

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getHeader("Cache-Control")).contains("no-store");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(CLIENT_VALUE).doesNotContain("rejected").doesNotContain("/api/")
                .contains("\"type\":\"https://nfnn.cz/problems/validation\"")
                .contains("\"title\":\"Neplatné údaje\"")
                .contains("\"detail\":\"Požadavek má tvar, který web nepřijímá. Zkontrolujte prosím adresu.\"");
    }

    @Test
    @DisplayName("Given an English client, when a rejected request is answered, then the texts are English")
    void should_answer_in_english_when_answered_given_english_client() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api//" + CLIENT_VALUE);
        request.addHeader("Accept-Language", "en");
        request.addPreferredLocale(Locale.ENGLISH);
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.handle(request, response, new RequestRejectedException(CLIENT_VALUE));

        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(CLIENT_VALUE)
                .contains("\"title\":\"Invalid data\"")
                .contains("\"detail\":\"The request has a form the site does not accept. Please check the address.\"");
    }

    @Test
    @DisplayName("Given a client in a language the site has no texts in, when a rejected request is answered, then the texts are Czech")
    void should_answer_in_czech_when_answered_given_language_without_texts() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api//" + CLIENT_VALUE);
        request.addHeader("Accept-Language", "de");
        request.addPreferredLocale(Locale.GERMAN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.handle(request, response, new RequestRejectedException(CLIENT_VALUE));

        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(CLIENT_VALUE)
                .contains("\"title\":\"Neplatné údaje\"");
    }
}
