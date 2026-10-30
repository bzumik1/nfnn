package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class ClientErrorReportOutputTest {

    private static final String CANARY_NAME = "Zxqv Kanárek";
    private static final String CANARY_AMOUNT = "7781,77";
    private static final String CANARY_RECEIPT = "2099-778177";

    @Autowired
    private MockMvc mockMvc;

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
}
