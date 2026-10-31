package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

@IntegrationTest
class RejectedMethodAnswerTest {

    private static final String CLIENT_METHOD = "NFNN-CLIENT-VALUE";

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Given a method the site does not know, when it reaches the security filter chain, then the firewall's refusal is the site's problem without the method")
    void should_answer_site_problem_without_method_when_sent_given_unknown_method() throws Exception {
        MvcResult result = mockMvc.perform(request(HttpMethod.valueOf(CLIENT_METHOD), "/api/content/news").header("Accept-Language", "cs"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(result.getResponse().getContentType()).isEqualTo("application/problem+json");
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat(result.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContainIgnoringCase(CLIENT_METHOD)
                .contains("\"type\":\"https://nfnn.cz/problems/validation\"")
                .contains("\"title\":\"Neplatné údaje\"");
    }
}
