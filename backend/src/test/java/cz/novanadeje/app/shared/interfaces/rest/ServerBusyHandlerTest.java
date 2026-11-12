package cz.novanadeje.app.shared.interfaces.rest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ServerBusyHandlerTest {

    private static final String EXCEPTION_TEXT = "Qkzw1590 select * from donor where email = ?";

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
    private MockMvc mockMvc;

    @RestController
    static class ProbeController {

        @GetMapping("/probe/donors/{wait}")
        String failing(@PathVariable String wait) {
            throw switch (wait) {
                case "lock" -> new CannotAcquireLockException(EXCEPTION_TEXT);
                case "deadlock" -> new PessimisticLockingFailureException(EXCEPTION_TEXT);
                case "statement" -> new QueryTimeoutException(EXCEPTION_TEXT);
                case "connection" -> new CannotCreateTransactionException(EXCEPTION_TEXT);
                default -> new IllegalStateException(EXCEPTION_TEXT);
            };
        }
    }

    @BeforeEach
    void setUp() {
        logged.start();
        handlerLogger().addAppender(logged);
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        ApiExceptionHandler api = new ApiExceptionHandler();
        api.setMessageSource(messages);
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(api, new ServerBusyHandler(messages), new UnhandledExceptionHandler(messages))
                .build();
    }

    @AfterEach
    void detachLog() {
        handlerLogger().detachAppender(logged);
        logged.stop();
    }

    @ParameterizedTest
    @ValueSource(strings = {"lock", "deadlock", "statement", "connection"})
    @DisplayName("Given a request whose database wait ran out, when it fails, then the answer is a 503 problem to retry in five seconds without the exception's text")
    void should_answer_503_to_retry_without_exception_text_when_failed_given_database_wait_ran_out(String wait) throws Exception {
        mockMvc.perform(get("/probe/donors/" + wait).header("Accept-Language", "cs"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Retry-After", "5"))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/server-busy"))
                .andExpect(jsonPath("$.title").value("Server je právě vytížený"))
                .andExpect(jsonPath("$.detail").value("Požadavek se nedokončil. Zkuste to prosím za chvíli znovu."))
                .andExpect(content().string(not(containsString("Qkzw1590"))));
    }

    @ParameterizedTest
    @ValueSource(strings = {"lock", "statement"})
    @DisplayName("Given a request whose database wait ran out, when it fails, then one WARN line names the failure's class, the method and the path pattern and none of the exception's text")
    void should_log_one_warn_with_class_method_and_pattern_when_failed_given_database_wait_ran_out(String wait) throws Exception {
        mockMvc.perform(get("/probe/donors/" + wait));

        assertThat(logged.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("Database wait ran out (" + (wait.equals("lock") ? "CannotAcquireLockException" : "QueryTimeoutException")
                    + ") answered as 503 at GET /probe/donors/{wait}");
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given a request failing for another reason, when it fails, then the answer stays the 500 problem")
    void should_answer_500_when_failed_given_other_failure() throws Exception {
        mockMvc.perform(get("/probe/donors/other"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/internal-error"));
    }

    @Test
    @DisplayName("Given an English client, when its database wait runs out, then the problem is in English")
    void should_answer_in_english_when_failed_given_english_client() throws Exception {
        mockMvc.perform(get("/probe/donors/lock").header("Accept-Language", "en"))
                .andExpect(jsonPath("$.title").value("The server is busy right now"))
                .andExpect(jsonPath("$.detail").value("The request did not finish. Please try again in a moment."));
    }

    private static Logger handlerLogger() {
        return (Logger) LoggerFactory.getLogger(ServerBusyHandler.class);
    }
}
