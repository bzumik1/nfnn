package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.error.NotFound;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.ConversionNotSupportedException;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.UnsatisfiedServletRequestParameterException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

class ProblemTextsTest {

    private static final String CLIENT_VALUE = "nfnn-client-value";
    private static final String CLIENT_METHOD = "NFNN-CLIENT-VALUE";
    private static final String EXCEPTION_TEXT = "nfnn-exception-text";
    private static final List<String> LANGUAGES = List.of("cs", "en", "de");
    private static final Pattern PROBLEM_CODE = Pattern.compile("\"((?:auth|contact|content|donations|donors|operations)/[a-z0-9-]+)\"");
    private static final Pattern DOMAIN_EXCEPTION = Pattern.compile("extends (RuleViolation|NotFound|Conflict|AuthenticationFailure|AccessDenied)\\b");

    private static final Map<String, Supplier<Exception>> FAILURES = Map.ofEntries(
            Map.entry("illegal-argument", () -> new IllegalArgumentException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("rule-without-texts", () -> new RuleViolation("donors/probe-without-texts", EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("not-found-without-texts", () -> new NotFound("donors/probe-not-found", EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("rule-with-texts", () -> new RuleViolation("donors/invalid-target", EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("method", () -> new HttpRequestMethodNotSupportedException(CLIENT_METHOD, List.of("GET"))),
            Map.entry("media-type", () -> new HttpMediaTypeNotSupportedException(new MediaType("text", CLIENT_VALUE),
                    List.of(MediaType.APPLICATION_JSON), HttpMethod.POST)),
            Map.entry("media-type-unparsable", () -> new HttpMediaTypeNotSupportedException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("not-acceptable", () -> new HttpMediaTypeNotAcceptableException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("binding", () -> new ServletRequestBindingException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("unsatisfied-parameters", () -> new UnsatisfiedServletRequestParameterException(new String[]{"mode=list"},
                    Map.of("mode", new String[]{CLIENT_VALUE}))),
            Map.entry("no-handler", () -> new NoHandlerFoundException("GET", "/api/" + CLIENT_VALUE, new HttpHeaders())),
            Map.entry("no-resource", () -> new NoResourceFoundException(HttpMethod.GET, "/api/" + CLIENT_VALUE, "api/" + CLIENT_VALUE)),
            Map.entry("conversion", () -> new ConversionNotSupportedException(CLIENT_VALUE, Integer.class, new IllegalStateException(EXCEPTION_TEXT))),
            Map.entry("type-mismatch", () -> new TypeMismatchException(CLIENT_VALUE, Integer.class)),
            Map.entry("not-readable", () -> new HttpMessageNotReadableException(EXCEPTION_TEXT + ": " + CLIENT_VALUE,
                    new MockHttpInputMessage(CLIENT_VALUE.getBytes(StandardCharsets.UTF_8)))),
            Map.entry("not-writable", () -> new HttpMessageNotWritableException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("async-timeout", AsyncRequestTimeoutException::new),
            Map.entry("upload-too-large", () -> new MaxUploadSizeExceededException(10, new IllegalStateException(EXCEPTION_TEXT))),
            Map.entry("authentication", () -> new BadCredentialsException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)),
            Map.entry("access-denied", () -> new AccessDeniedException(EXCEPTION_TEXT + ": " + CLIENT_VALUE)));

    private MockMvc mockMvc;
    private ResourceBundleMessageSource messages;

    @RestController
    static class ProbeController {

        @GetMapping("/probe")
        String read() {
            return "ok";
        }

        @PostMapping("/probe")
        String write(@RequestBody Map<String, Object> body) {
            return "ok";
        }

        @GetMapping("/fail/{kind}")
        String fail(@PathVariable String kind) throws Exception {
            throw FAILURES.get(kind).get();
        }
    }

    @BeforeEach
    void setUp() {
        messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        ApiExceptionHandler handler = new ApiExceptionHandler();
        handler.setMessageSource(messages);
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(handler)
                .build();
    }

    static Stream<Arguments> failuresInEveryLanguage() {
        return FAILURES.keySet().stream().sorted().flatMap(kind -> LANGUAGES.stream().map(language -> Arguments.of(kind, language)));
    }

    @ParameterizedTest(name = "{0} in {1}")
    @MethodSource("failuresInEveryLanguage")
    @DisplayName("Given a failure that carries exception text and a value the client sent, when it is answered, then the problem body holds neither")
    void should_hold_no_exception_text_or_client_value_when_answered_given_failure_carrying_both(String kind, String language) throws Exception {
        MvcResult result = mockMvc.perform(get("/fail/" + kind).header("Accept-Language", language)).andReturn();

        assertThat(bodyOf(result)).doesNotContainIgnoringCase(CLIENT_VALUE).doesNotContain(EXCEPTION_TEXT);
    }

    @Test
    @DisplayName("Given a body of a type the endpoint does not read, when it is posted, then the problem names neither the type nor the exception, in Czech")
    void should_answer_without_content_type_when_posted_given_unsupported_content_type() throws Exception {
        MvcResult result = mockMvc.perform(post("/probe").header("Accept-Language", "cs").contentType("text/x-" + CLIENT_VALUE).content("{}"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(415);
        assertThat(bodyOf(result)).doesNotContain(CLIENT_VALUE)
                .contains("\"title\":\"Nepodporovaný formát dat\"")
                .contains("\"detail\":\"Tato adresa data v tomto formátu nepřijímá.\"");
    }

    @Test
    @DisplayName("Given a request method the address does not take, when it is sent, then the problem does not repeat the method, in English")
    void should_answer_without_method_when_sent_given_unsupported_method() throws Exception {
        MvcResult result = mockMvc.perform(request(HttpMethod.valueOf(CLIENT_METHOD), "/probe").header("Accept-Language", "en")).andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(405);
        assertThat(bodyOf(result)).doesNotContainIgnoringCase(CLIENT_VALUE)
                .contains("\"title\":\"Method not allowed\"")
                .contains("\"detail\":\"This address does not take this kind of request.\"");
    }

    @Test
    @DisplayName("Given an address with nothing behind it, when it is asked for, then the problem does not repeat the address, in Czech")
    void should_answer_without_path_when_asked_given_unknown_resource() throws Exception {
        MvcResult result = mockMvc.perform(get("/fail/no-resource").header("Accept-Language", "cs")).andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result)).doesNotContain(CLIENT_VALUE)
                .contains("\"title\":\"Nenalezeno\"")
                .contains("\"detail\":\"Na této adrese nic není.\"");
    }

    @Test
    @DisplayName("Given a value a value object refuses, when the refusal is answered, then the problem says so in the client's language without the exception's text")
    void should_answer_with_translated_texts_when_answered_given_illegal_argument() throws Exception {
        MvcResult czech = mockMvc.perform(get("/fail/illegal-argument").header("Accept-Language", "cs")).andReturn();
        MvcResult english = mockMvc.perform(get("/fail/illegal-argument").header("Accept-Language", "en")).andReturn();

        assertThat(czech.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(czech)).contains("\"type\":\"https://nfnn.cz/problems/validation\"")
                .contains("\"title\":\"Neplatné údaje\"")
                .contains("\"detail\":\"Některou ze zadaných hodnot nejde přijmout. Zkontrolujte je prosím a zkuste to znovu.\"");
        assertThat(bodyOf(english)).contains("\"title\":\"Invalid data\"")
                .contains("\"detail\":\"One of the values cannot be accepted. Please check them and try again.\"");
    }

    @Test
    @DisplayName("Given a language without its own texts, when a domain failure is answered, then the problem carries the Czech texts")
    void should_answer_in_czech_when_domain_failure_answered_given_language_without_texts() throws Exception {
        MvcResult result = mockMvc.perform(get("/fail/rule-with-texts").header("Accept-Language", "de")).andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result)).contains("\"title\":\"" + messages.getMessage("problem.donors/invalid-target.title", null, Locale.forLanguageTag("cs")) + "\"")
                .contains("\"detail\":\"" + messages.getMessage("problem.donors/invalid-target.detail", null, Locale.forLanguageTag("cs")) + "\"");
    }

    @Test
    @DisplayName("Given a domain failure whose code has no texts, when it is answered, then the problem carries the status's own title and no detail")
    void should_answer_with_status_title_when_answered_given_code_without_texts() throws Exception {
        MvcResult result = mockMvc.perform(get("/fail/not-found-without-texts").header("Accept-Language", "cs")).andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result)).contains("\"title\":\"Not Found\"").doesNotContain("\"detail\"");
    }

    @Test
    @DisplayName("Given every problem code a domain failure is raised with, when the bundles are read, then each has a Czech and an English title and detail")
    void should_find_czech_and_english_texts_when_bundles_read_given_every_domain_problem_code() throws IOException {
        List<String> codes;
        try (Stream<Path> sources = Files.walk(Path.of("src/main/java"))) {
            codes = sources.filter(path -> path.toString().endsWith(".java"))
                    .map(ProblemTextsTest::read)
                    .filter(source -> DOMAIN_EXCEPTION.matcher(source).find())
                    .flatMap(ProblemTextsTest::problemCodes)
                    .distinct()
                    .sorted()
                    .toList();
        }

        assertThat(codes).contains("donors/donor-not-found", "operations/invalid-settings");
        assertThat(codes.stream().flatMap(this::missingTexts).toList()).isEmpty();
    }

    private Stream<String> missingTexts(String code) {
        return Stream.of(Locale.forLanguageTag("cs"), Locale.ENGLISH)
                .flatMap(locale -> Stream.of("title", "detail")
                        .map(part -> "problem." + code + "." + part)
                        .filter(key -> messages.getMessage(key, null, null, locale) == null)
                        .map(key -> key + " (" + locale + ")"));
    }

    private static Stream<String> problemCodes(String source) {
        Matcher matcher = PROBLEM_CODE.matcher(source);
        Stream.Builder<String> codes = Stream.builder();
        while (matcher.find()) {
            codes.add(matcher.group(1));
        }
        return codes.build();
    }

    private static String read(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static String bodyOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }
}
