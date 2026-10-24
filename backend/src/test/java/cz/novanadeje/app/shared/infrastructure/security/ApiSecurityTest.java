package cz.novanadeje.app.shared.infrastructure.security;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
@AutoConfigureMockMvc
class ApiSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Given no credentials, when a protected API path is requested, then the answer is 401 as problem+json with no Basic challenge")
    void should_answer_401_problem_when_protected_path_requested_given_no_credentials() throws Exception {
        mockMvc.perform(get("/api/donors/me").header("Accept-Language", "cs"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/auth/unauthenticated"))
                .andExpect(jsonPath("$.title").value("Přihlášení je vyžadováno"));
    }

    @Test
    @DisplayName("Given no credentials, when the health endpoint is requested, then it answers 200")
    void should_answer_200_when_health_requested_given_no_credentials() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }
}
