package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

@IntegrationTest
class VersionHeadersTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BuildProperties build;

    @Nested
    @DisplayName("Given a request to the API")
    class ApiRequests {

        @Test
        @DisplayName("when a public resource answers, then the answer names the server's revision and API generation")
        void should_name_revision_and_generation_when_answered_given_a_public_resource() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(get("/api/donations/payment-details")).andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(200);
            assertVersionHeaders(response);
        }

        @Test
        @DisplayName("when the security chain refuses it without a token, then the refusal names them too")
        void should_name_revision_and_generation_when_refused_given_no_token() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(get("/api/donations/me/summary")).andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(401);
            assertVersionHeaders(response);
        }

        @Test
        @DisplayName("when its body is invalid, then the validation problem names them too")
        void should_name_revision_and_generation_when_refused_given_an_invalid_body() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(post("/api/contact/messages")
                            .header("X-Forwarded-For", "203.0.113.23")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(400);
            assertVersionHeaders(response);
        }

        @Test
        @DisplayName("when the firewall rejects its method, then the rejection names them too")
        void should_name_revision_and_generation_when_rejected_given_an_unknown_method() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(request(HttpMethod.valueOf("NFNN-UNKNOWN"), "/api/content/news"))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(400);
            assertVersionHeaders(response);
        }

        @Test
        @DisplayName("when the browser app names its own revision, then the answer still names the server's")
        void should_name_server_revision_when_answered_given_the_app_names_its_own() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(get("/api/donations/payment-details").header("Nfnn-App", "0123abc"))
                    .andReturn().getResponse();

            assertThat(response.getHeader("Nfnn-Revision")).isEqualTo(build.revision());
        }
    }

    @Nested
    @DisplayName("Given a browser app that names another API generation")
    class AppOfAnotherGeneration {

        private final String otherGeneration = String.valueOf(VersionHeadersFilter.API_GENERATION + 1);

        @Test
        @DisplayName("when it sends a write, then the server refuses it as needing an update and names its own generation")
        void should_refuse_as_update_required_when_writing_given_another_generation() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(post("/api/contact/messages")
                            .header("X-Forwarded-For", "203.0.113.24")
                            .header("Nfnn-App-Api", otherGeneration)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(426);
            assertThat(response.getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            assertThat(response.getHeader("Cache-Control")).contains("no-store");
            assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                    .contains("\"type\":\"https://nfnn.cz/problems/app/update-required\"")
                    .contains("\"status\":426")
                    .contains("\"title\":\"Web mezitím dostal novou verzi\"")
                    .contains("\"detail\":\"Nic jsme neodeslali. Načtěte stránku znovu a zkuste to ještě jednou.\"");
            assertVersionHeaders(response);
        }

        @Test
        @DisplayName("when it asks in English, then the refusal is in English")
        void should_refuse_in_english_when_writing_given_another_generation_and_english() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(post("/api/contact/messages")
                            .header("X-Forwarded-For", "203.0.113.25")
                            .header("Nfnn-App-Api", otherGeneration)
                            .header("Accept-Language", "en")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(426);
            assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"title\":\"The site has a new version\"");
        }

        @Test
        @DisplayName("when it reads, then the server answers as usual")
        void should_answer_when_reading_given_another_generation() throws Exception {
            MockHttpServletResponse response = mockMvc.perform(get("/api/donations/payment-details")
                            .header("Nfnn-App-Api", otherGeneration))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("when it refreshes or ends the session or asks for a receipt's status, then the server does not refuse it as needing an update")
        void should_not_refuse_when_keeping_the_session_or_asking_a_status_given_another_generation() throws Exception {
            for (String path : new String[] {"/api/donors/auth/refresh", "/api/donors/auth/logout", "/api/donors/devices/status", "/api/donations/receipts/status"}) {
                MockHttpServletResponse response = mockMvc.perform(post(path)
                                .header("X-Forwarded-For", "203.0.113.26")
                                .header("Nfnn-App-Api", otherGeneration))
                        .andReturn().getResponse();

                assertThat(response.getStatus()).as(path).isNotEqualTo(426);
            }
        }
    }

    @Nested
    @DisplayName("Given a write that names no other API generation")
    class WriteOfTheSameGeneration {

        @Test
        @DisplayName("when it names the server's generation, no generation or no valid one, then the server handles it as usual")
        void should_handle_as_usual_when_writing_given_the_same_missing_or_invalid_generation() throws Exception {
            for (String generation : new String[] {String.valueOf(VersionHeadersFilter.API_GENERATION), null, "abc", "0"}) {
                var request = post("/api/contact/messages")
                        .header("X-Forwarded-For", "203.0.113.27")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}");
                if (generation != null) {
                    request.header("Nfnn-App-Api", generation);
                }

                assertThat(mockMvc.perform(request).andReturn().getResponse().getStatus()).as(String.valueOf(generation)).isEqualTo(400);
            }
        }
    }

    @Test
    @DisplayName("Given a request outside the API, when the health endpoint answers, then it names neither header")
    void should_name_neither_header_when_answered_given_the_health_endpoint() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get("/actuator/health")).andReturn().getResponse();

        assertThat(response.getHeader("Nfnn-Revision")).isNull();
        assertThat(response.getHeader("Nfnn-Api")).isNull();
    }

    private void assertVersionHeaders(MockHttpServletResponse response) {
        assertThat(response.getHeaders("Nfnn-Revision")).containsExactly(build.revision());
        assertThat(response.getHeaders("Nfnn-Api")).containsExactly(String.valueOf(VersionHeadersFilter.API_GENERATION));
    }
}
