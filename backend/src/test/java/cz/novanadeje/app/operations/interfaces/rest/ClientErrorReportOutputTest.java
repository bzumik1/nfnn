package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import cz.novanadeje.app.support.RaisedLogLevels;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class ClientErrorReportOutputTest {

    private static final String CANARY_NAME = "Zxqv Kanárek";
    private static final String CANARY_AMOUNT = "7781,77";
    private static final String CANARY_RECEIPT = "2099-778177";

    private static final String FORGED_TIME = "2026-10-30T00:00:00.000Z";
    private static final String FORGED_LINE = FORGED_TIME
            + "  WARN 1 --- [nova-nadeje] [exec-1] c.n.app.operations.clienterrors          : Browser error kind=verify-signature Zxqv FORGED";
    private static final String VALID_FIELDS = "\"place\":\"global\",\"name\":\"Error\",\"appVersion\":\"dev\",\"browser\":\"chrome\",\"os\":\"android\",\"display\":\"browser\"";
    private static final List<String> MALFORMED_CANARIES = List.of("Zxqv", "Kanárek", "Kanarek", "778177", "FORGED", FORGED_TIME);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LoggingSystem loggingSystem;

    static Stream<Arguments> malformedBodies() {
        return Stream.of(
                Arguments.of("a string number carrying a line break and a forged line", "/api/operations/client-errors",
                        "{\"kind\":\"unexpected\"," + VALID_FIELDS + ",\"count\":\"1\\r\\n" + FORGED_LINE + "\"}"),
                Arguments.of("a string major version", "/api/operations/client-errors",
                        "{\"kind\":\"unexpected\"," + VALID_FIELDS + ",\"browserMajor\":\"Zxqv Kanárek 2099-778177\",\"count\":1}"),
                Arguments.of("a bare token", "/api/operations/client-errors",
                        "{\"kind\":ZxqvKanarek778177," + VALID_FIELDS + ",\"count\":1}"),
                Arguments.of("trailing garbage", "/api/operations/client-errors",
                        "{\"kind\":\"unexpected\"," + VALID_FIELDS + ",\"count\":1} Zxqv-778177 FORGED"),
                Arguments.of("an object for a string", "/api/operations/client-errors",
                        "{\"kind\":{\"Zxqv\":\"778177\"}," + VALID_FIELDS + ",\"count\":1}"),
                Arguments.of("a bare token on the contact form", "/api/contact/messages",
                        "{\"fullName\":ZxqvKanarek778177,\"email\":\"jana@example.cz\",\"message\":\"x\",\"website\":\"\"}"),
                Arguments.of("a string number on the sign-in", "/api/donors/auth/login",
                        "{\"email\":[\"Zxqv\\r\\n" + FORGED_LINE + "\"],\"password\":\"778177\"}"));
    }

    @Test
    @DisplayName("Given a report from an anonymous browser, when it is posted, then the output holds its line once and no canary in any encoding")
    void should_hold_the_line_and_no_canary_when_posted_given_an_anonymous_browser(CapturedOutput output) throws Exception {
        String body = """
                {"kind":"pdf-load","place":"global","name":"NotAllowedError","appVersion":"0a1b2c3","browser":"firefox","browserMajor":140,
                 "os":"linux","display":"browser","count":3,
                 "message":"%1$s %2$s Kč %3$s","stack":"at %1$s","url":"/overit#%3$s","userAgent":"%1$s"}
                """.formatted(CANARY_NAME, CANARY_AMOUNT, CANARY_RECEIPT);

        mockMvc.perform(post("/api/operations/client-errors").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Forwarded-For", "198.51.100.78")
                        .header("User-Agent", CANARY_NAME + " " + CANARY_RECEIPT)
                        .header("Referer", "https://nfnn.cz/overit#" + CANARY_RECEIPT))
                .andExpect(status().isNoContent());

        assertThat(output.getAll()).containsOnlyOnce(
                "Browser error kind=pdf-load place=global name=NotAllowedError version=0a1b2c3 browser=firefox/140 os=linux display=browser count=3");
        for (String canary : List.of(CANARY_NAME, "Kanárek", CANARY_AMOUNT, "7781", CANARY_RECEIPT, "778177", "198.51.100.78")) {
            assertThat(output.getAll()).doesNotContain(canary)
                    .doesNotContain(URLEncoder.encode(canary, StandardCharsets.UTF_8))
                    .doesNotContain(Base64.getEncoder().encodeToString(canary.getBytes(StandardCharsets.UTF_8)));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("malformedBodies")
    @DisplayName("Given every log level an administrator can raise, when a public endpoint gets a body that cannot be read, then it answers 400 and the output holds none of the body's text")
    void should_log_none_of_the_body_when_unreadable_given_every_raisable_level(String malformation, String path, String body, CapturedOutput output) throws Exception {
        try (RaisedLogLevels raised = RaisedLogLevels.raise(loggingSystem, RaisedLogLevels.EVERY_LEVEL_AN_ADMINISTRATOR_CAN_SET)) {
            mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body).header("X-Forwarded-For", "198.51.100.79"))
                    .andExpect(status().isBadRequest());
        }

        for (String canary : MALFORMED_CANARIES) {
            assertThat(output.getAll()).as(malformation).doesNotContain(canary);
        }
        assertThat(output.getAll().lines()).as(malformation).noneMatch(line -> line.startsWith(FORGED_TIME));
    }
}
