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
