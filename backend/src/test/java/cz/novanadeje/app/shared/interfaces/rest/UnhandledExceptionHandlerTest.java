package cz.novanadeje.app.shared.interfaces.rest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.shared.domain.error.NotFound;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.HandlerMapping;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.mail.MailSendException;
import org.springframework.transaction.TransactionSystemException;

import java.io.EOFException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class UnhandledExceptionHandlerTest {

    private static final String CLIENT_VALUE = "nfnn-client-value";
    private static final String EXCEPTION_TEXT = "nfnn-exception-text";
    private static final String PARTIAL_BODY = "PARTIAL-BACKUP-BYTES";

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
    private UnhandledExceptionHandler handler;
    private MockMvc mockMvc;

    @RestController
    static class ProbeController {

        @GetMapping("/probe/receipts/{id}")
        String unexpected(@PathVariable String id) {
            throw new IllegalStateException(EXCEPTION_TEXT + ": " + id);
        }

        @GetMapping("/probe/anonymous")
        String anonymous() {
            throw new RuntimeException(EXCEPTION_TEXT) {
            };
        }

        @GetMapping("/probe/client-abort")
        String clientAbort() throws IOException {
            throw new ClientAbortException(new IOException("Broken pipe"));
        }

        @GetMapping("/probe/wrapped-client-abort")
        String wrappedClientAbort() {
            throw new UncheckedIOException(new ClientAbortException(new IOException("Connection reset by peer")));
        }

        @GetMapping("/probe/broken-pipe")
        String brokenPipe() throws IOException {
            throw new IOException("Broken pipe");
        }

        @GetMapping("/probe/truncated-file")
        String truncatedFile() {
            throw new UncheckedIOException(new EOFException("truncated image"));
        }

        @GetMapping("/probe/commit-over-broken-socket")
        String commitOverBrokenSocket() {
            throw new TransactionSystemException("Could not commit", new SocketException("Broken pipe"));
        }

        @GetMapping("/probe/mail-connection-reset")
        String mailConnectionReset() {
            throw new MailSendException("Mail server connection failed", new SocketException("Connection reset by peer"));
        }

        @GetMapping("/probe/partly-written")
        void partlyWritten(HttpServletResponse response) throws IOException {
            response.getOutputStream().write(PARTIAL_BODY.getBytes(StandardCharsets.UTF_8));
            response.flushBuffer();
            throw new UncheckedIOException(new IOException("Input/output error"));
        }

        @GetMapping("/probe/not-usable")
        String notUsable() throws IOException {
            throw new AsyncRequestNotUsableException("ServletOutputStream failed to write: " + EXCEPTION_TEXT);
        }

        @GetMapping("/probe/domain")
        String domain() {
            throw new ProbeDonorNotFound();
        }

        @GetMapping("/probe/wrapped-domain")
        String wrappedDomain() {
            throw new IllegalStateException(EXCEPTION_TEXT, new ProbeDonorNotFound());
        }

        @GetMapping("/probe/access-denied")
        String accessDenied() {
            throw new AccessDeniedException(EXCEPTION_TEXT);
        }

        @GetMapping("/probe/authentication")
        String authentication() {
            throw new BadCredentialsException(EXCEPTION_TEXT);
        }

        @PostMapping("/probe/write-only")
        String writeOnly(@RequestBody Map<String, Object> body) {
            return "ok";
        }
    }

    @BeforeEach
    void setUp() {
        logged.start();
        logger(UnhandledExceptionHandler.class).addAppender(logged);
        logger(ApiExceptionHandler.class).addAppender(logged);
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        ApiExceptionHandler specific = new ApiExceptionHandler();
        specific.setMessageSource(messages);
        handler = new UnhandledExceptionHandler(messages);
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(handler, specific)
                .build();
    }

    @AfterEach
    void detachLog() {
        logger(UnhandledExceptionHandler.class).detachAppender(logged);
        logger(ApiExceptionHandler.class).detachAppender(logged);
        logged.stop();
    }

    @Nested
    @DisplayName("Given a handler that throws an exception no other handler answers")
    class UnexpectedFailure {

        @Test
        @DisplayName("when a Czech client asks, then the answer is the fixed internal error problem in Czech")
        void should_answer_internal_error_in_czech_when_asked_given_czech_client() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/receipts/" + CLIENT_VALUE).queryParam("q", CLIENT_VALUE).header("Accept-Language", "cs"))
                    .andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(500);
            assertThat(result.getResponse().getContentType()).isEqualTo("application/problem+json");
            assertThat(bodyOf(result))
                    .contains("\"type\":\"https://nfnn.cz/problems/internal-error\"")
                    .contains("\"status\":500")
                    .contains("\"title\":\"Něco se pokazilo\"")
                    .contains("\"detail\":\"Chyba je na naší straně. Zkuste to prosím později, a když to nepůjde ani potom, napište nám na info@nfnn.cz.\"")
                    .doesNotContain(EXCEPTION_TEXT);
        }

        @Test
        @DisplayName("when an English client asks, then the problem is in English")
        void should_answer_internal_error_in_english_when_asked_given_english_client() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/receipts/7").header("Accept-Language", "en")).andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(500);
            assertThat(bodyOf(result))
                    .contains("\"title\":\"Something went wrong\"")
                    .contains("\"detail\":\"The fault is on our side. Please try again later, and if it still does not work, write to us at info@nfnn.cz.\"");
        }

        @Test
        @DisplayName("when a client in a language without texts asks, then the problem is in Czech")
        void should_answer_internal_error_in_czech_when_asked_given_language_without_texts() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/receipts/7").header("Accept-Language", "de")).andReturn();

            assertThat(bodyOf(result)).contains("\"title\":\"Něco se pokazilo\"");
        }

        @Test
        @DisplayName("when it is answered, then one ERROR line names the exception's class, the method and the handler's path pattern, without the address, the message or the stack trace")
        void should_log_one_error_with_class_method_and_pattern_when_answered() throws Exception {
            mockMvc.perform(get("/probe/receipts/" + CLIENT_VALUE).queryParam("q", CLIENT_VALUE));

            assertThat(logged.list).singleElement().satisfies(line -> {
                assertThat(line.getLoggerName()).isEqualTo("cz.novanadeje.app.shared.interfaces.rest.UnhandledExceptionHandler");
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).isEqualTo("Unhandled IllegalStateException answered as 500 at GET /probe/receipts/{id}");
                assertThat(line.getThrowableProxy()).isNull();
            });
        }

        @Test
        @DisplayName("when the exception's class has no simple name, then the line names its class")
        void should_log_class_name_when_answered_given_anonymous_exception() throws Exception {
            mockMvc.perform(get("/probe/anonymous"));

            assertThat(logged.list).singleElement().extracting(ILoggingEvent::getFormattedMessage)
                    .isEqualTo("Unhandled " + ProbeController.class.getName() + "$1 answered as 500 at GET /probe/anonymous");
        }
    }

    @Nested
    @DisplayName("Given a request that matched no handler pattern")
    class WithoutPattern {

        @Test
        @DisplayName("when its failure is answered, then the line names the fixed placeholder instead of the address")
        void should_log_placeholder_when_answered_given_no_matched_pattern() {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/" + CLIENT_VALUE);

            handler.handleUnhandled(new IllegalStateException(EXCEPTION_TEXT), request, new MockHttpServletResponse());

            assertThat(logged.list).singleElement().extracting(ILoggingEvent::getFormattedMessage)
                    .isEqualTo("Unhandled IllegalStateException answered as 500 at GET (unmatched)");
        }

        @Test
        @DisplayName("when its method is not a standard one, then the line names it OTHER")
        void should_log_other_method_when_answered_given_nonstandard_method() {
            MockHttpServletRequest request = new MockHttpServletRequest("NFNN-CLIENT-VALUE", "/probe/receipts/7");
            request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/probe/receipts/{id}");

            handler.handleUnhandled(new IllegalStateException(EXCEPTION_TEXT), request, new MockHttpServletResponse());

            assertThat(logged.list).singleElement().extracting(ILoggingEvent::getFormattedMessage)
                    .isEqualTo("Unhandled IllegalStateException answered as 500 at OTHER /probe/receipts/{id}");
        }
    }

    @Nested
    @DisplayName("Given a client that went away")
    class Disconnects {

        @Test
        @DisplayName("when the container reports the abort, then nothing is written and nothing is logged")
        void should_write_and_log_nothing_when_thrown_given_client_abort() throws Exception {
            assertNothingWritten(mockMvc.perform(get("/probe/client-abort")).andReturn());
        }

        @Test
        @DisplayName("when the container's abort arrives wrapped in another exception, then nothing is written and nothing is logged")
        void should_write_and_log_nothing_when_thrown_given_wrapped_client_abort() throws Exception {
            assertNothingWritten(mockMvc.perform(get("/probe/wrapped-client-abort")).andReturn());
        }

        @Test
        @DisplayName("when the response is no longer usable, then nothing is written and nothing is logged")
        void should_write_and_log_nothing_when_thrown_given_unusable_response() throws Exception {
            assertNothingWritten(mockMvc.perform(get("/probe/not-usable")).andReturn());
        }

        private void assertNothingWritten(MvcResult result) throws Exception {
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            assertThat(result.getResponse().getContentType()).isNull();
            assertThat(bodyOf(result)).isEmpty();
            assertThat(logged.list).isEmpty();
        }
    }

    @Nested
    @DisplayName("Given a failure of the server's own connections or files that reads like a disconnect")
    class ServerSideInputOutput {

        @Test
        @DisplayName("when a bare broken pipe is thrown, then it is answered as 500 and logged")
        void should_answer_500_and_log_when_thrown_given_bare_broken_pipe() throws Exception {
            assertAnsweredAs500(mockMvc.perform(get("/probe/broken-pipe")).andReturn(), "IOException", "/probe/broken-pipe");
        }

        @Test
        @DisplayName("when a file ends early, then it is answered as 500 and logged")
        void should_answer_500_and_log_when_thrown_given_end_of_file() throws Exception {
            assertAnsweredAs500(mockMvc.perform(get("/probe/truncated-file")).andReturn(), "UncheckedIOException", "/probe/truncated-file");
        }

        @Test
        @DisplayName("when a commit fails over a broken database socket, then it is answered as 500 and logged")
        void should_answer_500_and_log_when_thrown_given_commit_over_broken_socket() throws Exception {
            assertAnsweredAs500(mockMvc.perform(get("/probe/commit-over-broken-socket")).andReturn(), "TransactionSystemException", "/probe/commit-over-broken-socket");
        }

        @Test
        @DisplayName("when the mail server resets the connection, then it is answered as 500 and logged")
        void should_answer_500_and_log_when_thrown_given_mail_connection_reset() throws Exception {
            assertAnsweredAs500(mockMvc.perform(get("/probe/mail-connection-reset")).andReturn(), "MailSendException", "/probe/mail-connection-reset");
        }

        private void assertAnsweredAs500(MvcResult result, String className, String pattern) throws Exception {
            assertThat(result.getResponse().getStatus()).isEqualTo(500);
            assertThat(bodyOf(result)).contains("\"type\":\"https://nfnn.cz/problems/internal-error\"");
            assertThat(logged.list).singleElement().satisfies(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).isEqualTo("Unhandled " + className + " answered as 500 at GET " + pattern);
            });
        }
    }

    @Nested
    @DisplayName("Given a handler that already sent part of its answer")
    class CommittedResponse {

        @Test
        @DisplayName("when it then fails, then no problem is appended to what was sent and one ERROR line names the failure")
        void should_append_nothing_and_log_one_line_when_thrown_given_committed_response() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/partly-written")).andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            assertThat(bodyOf(result)).isEqualTo(PARTIAL_BODY);
            assertThat(logged.list).singleElement().satisfies(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).isEqualTo("Unhandled UncheckedIOException answered as 500 at GET /probe/partly-written");
                assertThat(line.getThrowableProxy()).isNull();
            });
        }
    }

    @Nested
    @DisplayName("Given a failure another handler answers")
    class AnsweredElsewhere {

        @Test
        @DisplayName("when a domain failure is thrown, then it keeps its own problem and nothing is logged")
        void should_keep_domain_problem_when_thrown_given_domain_failure() throws Exception {
            assertAnswered(mockMvc.perform(get("/probe/domain")).andReturn(), 404, "https://nfnn.cz/problems/donors/donor-not-found");
        }

        @Test
        @DisplayName("when an unexpected exception wraps a domain failure, then the domain failure's problem answers")
        void should_keep_domain_problem_when_thrown_given_domain_failure_as_cause() throws Exception {
            assertAnswered(mockMvc.perform(get("/probe/wrapped-domain")).andReturn(), 404, "https://nfnn.cz/problems/donors/donor-not-found");
        }

        @Test
        @DisplayName("when access is denied, then the answer stays 403")
        void should_keep_forbidden_when_thrown_given_access_denied() throws Exception {
            assertAnswered(mockMvc.perform(get("/probe/access-denied")).andReturn(), 403, "https://nfnn.cz/problems/auth/forbidden");
        }

        @Test
        @DisplayName("when authentication fails, then the answer stays 401")
        void should_keep_unauthenticated_when_thrown_given_authentication_failure() throws Exception {
            assertAnswered(mockMvc.perform(get("/probe/authentication")).andReturn(), 401, "https://nfnn.cz/problems/auth/unauthenticated");
        }

        @Test
        @DisplayName("when the method is not supported, then Spring's 405 answers")
        void should_keep_method_not_allowed_when_sent_given_unsupported_method() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/write-only")).andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(405);
            assertThat(logged.list).isEmpty();
        }

        @Test
        @DisplayName("when the body type is not supported, then Spring's 415 answers")
        void should_keep_unsupported_media_type_when_posted_given_unsupported_type() throws Exception {
            MvcResult result = mockMvc.perform(post("/probe/write-only").contentType("text/x-probe").content("{}")).andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(415);
            assertThat(logged.list).isEmpty();
        }

        @Test
        @DisplayName("when the address has nothing behind it, then the answer stays 404")
        void should_keep_not_found_when_asked_given_unknown_address() throws Exception {
            MvcResult result = mockMvc.perform(get("/probe/nothing-here")).andReturn();

            assertThat(result.getResponse().getStatus()).isEqualTo(404);
            assertThat(logged.list).isEmpty();
        }

        private void assertAnswered(MvcResult result, int status, String type) throws Exception {
            assertThat(result.getResponse().getStatus()).isEqualTo(status);
            assertThat(bodyOf(result)).contains("\"type\":\"" + type + "\"");
            assertThat(logged.list).extracting(ILoggingEvent::getLevel).doesNotContain(Level.ERROR);
            assertThat(logged.list).extracting(ILoggingEvent::getLoggerName).doesNotContain(UnhandledExceptionHandler.class.getName());
        }
    }

    private static Logger logger(Class<?> owner) {
        return (Logger) LoggerFactory.getLogger(owner);
    }

    private static String bodyOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    static final class ProbeDonorNotFound extends NotFound {

        ProbeDonorNotFound() {
            super("donors/donor-not-found", EXCEPTION_TEXT);
        }
    }
}
