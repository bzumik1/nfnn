package cz.novanadeje.app.operations.interfaces.rest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

@IntegrationTest
class SetupHeaderValidationTest {

    private static final String OVERSIZE_CODE = "Q".repeat(500);
    private static final String OVERSIZE_KEY = "K".repeat(700);

    @Autowired
    private MockMvc mockMvc;

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        logged.start();
        root().addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        root().detachAppender(logged);
        logged.stop();
    }

    @Nested
    @DisplayName("Given a setup code header longer than any setup code")
    class OversizeSetupCode {

        @Test
        @DisplayName("when the backup key is asked for with it, then the answer is a validation problem naming the code without its value, and nothing is logged as an error")
        void should_answer_validation_problem_without_value_when_asked_given_oversize_code() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(get("/api/operations/setup/backup-key")
                            .header("X-Forwarded-For", "203.0.113.41")
                            .header("Accept-Language", "cs")
                            .header(SetupController.CODE_HEADER, OVERSIZE_CODE))
                    .andReturn().getResponse();

            assertValidationProblem(response, "code", OVERSIZE_CODE);
        }
    }

    @Nested
    @DisplayName("Given a backup key header longer than any backup key")
    class OversizeBackupKey {

        @Test
        @DisplayName("when a restore is uploaded with it, then the answer is a validation problem naming the key without its value, and nothing is logged as an error")
        void should_answer_validation_problem_without_value_when_uploaded_given_oversize_key() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(put("/api/operations/setup/restore")
                            .header("X-Forwarded-For", "203.0.113.42")
                            .header("Accept-Language", "cs")
                            .header(SetupController.BACKUP_KEY_HEADER, OVERSIZE_KEY)
                            .contentType(MediaType.APPLICATION_OCTET_STREAM)
                            .content(new byte[]{1, 2, 3}))
                    .andReturn().getResponse();

            assertValidationProblem(response, "backupKey", OVERSIZE_KEY);
        }
    }

    private void assertValidationProblem(MockHttpServletResponse response, String field, String sentValue) throws Exception {
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentType()).isEqualTo("application/problem+json");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .contains("\"type\":\"https://nfnn.cz/problems/validation\"")
                .contains("\"title\":\"Neplatné údaje\"")
                .contains("\"field\":\"" + field + "\"")
                .doesNotContain(sentValue.substring(0, 40));
        assertThat(logged.list).extracting(ILoggingEvent::getLevel).doesNotContain(Level.ERROR);
    }

    private static Logger root() {
        return (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    }
}
