package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class UndecodableTargetFilterTest {

    private final UndecodableTargetFilter filter = new UndecodableTargetFilter(messages(), localeResolver());

    @Test
    @DisplayName("Given Tomcat's error page for a target with a path parameter it cannot decode, when it is dispatched, then the answer is a Czech validation problem without the target and the error page is not rendered")
    void should_answer_validation_problem_without_target_when_dispatched_given_error_page_for_undecodable_target() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain errorPage = new MockFilterChain();

        filter.doFilter(errorDispatchFor("/api/x;m=%ZZQkzw1611", "cs"), response, errorPage);

        assertThat(errorPage.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        JsonNode problem = JsonMapper.builder().build().readTree(response.getContentAsString());
        assertThat(problem.get("type").asString()).isEqualTo("https://nfnn.cz/problems/validation");
        assertThat(problem.get("title").asString()).isEqualTo("Neplatné údaje");
        assertThat(problem.get("detail").asString()).isEqualTo("Zkontrolujte prosím označená pole.");
        assertThat(problem.get("status").asInt()).isEqualTo(400);
        assertThat(problem.get("errors").isEmpty()).isTrue();
        assertThat(response.getContentAsString()).doesNotContain("Qkzw1611");
    }

    @Test
    @DisplayName("Given an English client, when Tomcat's error page for an undecodable target is dispatched, then the problem title is in English")
    void should_answer_in_english_when_dispatched_given_english_client() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(errorDispatchFor("/api/content/news;m=%ZZ", "en"), response, new MockFilterChain());

        assertThat(JsonMapper.builder().build().readTree(response.getContentAsString()).get("title").asString()).isEqualTo("Invalid data");
    }

    @Test
    @DisplayName("Given the error page for a target that can be decoded, when it is dispatched, then the error page renders as before")
    void should_render_error_page_when_dispatched_given_decodable_target() throws Exception {
        MockFilterChain errorPage = new MockFilterChain();

        filter.doFilter(errorDispatchFor("/api/content/news;m=%C3%A1", "cs"), new MockHttpServletResponse(), errorPage);

        assertThat(errorPage.getRequest()).isNotNull();
    }

    @Test
    @DisplayName("Given a request that is not an error page, when it passes, then the filter lets it through")
    void should_let_request_through_when_it_passes_given_no_error_dispatch() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/content/news");
        request.setAttribute(RequestDispatcher.FORWARD_REQUEST_URI, "/api/x;m=%ZZ");
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    private static MockHttpServletRequest errorDispatchFor(String target, String language) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/error");
        request.setDispatcherType(DispatcherType.ERROR);
        request.setAttribute(RequestDispatcher.FORWARD_REQUEST_URI, target);
        request.setAttribute(RequestDispatcher.ERROR_REQUEST_URI, target);
        request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, 400);
        request.addHeader("Accept-Language", language);
        return request;
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }

    private static AcceptHeaderLocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setDefaultLocale(Locale.forLanguageTag("cs"));
        return resolver;
    }
}
