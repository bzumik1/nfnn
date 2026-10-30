package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.regression.BaselineRows;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.TestSupportConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
@Import(TestSupportConfiguration.class)
@TestPropertySource(properties = "app.donations.receipt.first-year=2026")
class OverviewSharedCasesTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private FirstReceiptYear firstReceiptYear;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Nested
    @DisplayName("Given the admin overview cases")
    class AdminOverviewCases extends SharedCaseRunner {

        @Override
        protected String caseFile() {
            return "admin-overview/year-overview.json";
        }

        @Override
        protected String when() {
            return "when the backend selects its rows with the real queries and compiles the year overview";
        }

        @Override
        protected String then() {
            return "then the administration gets the expected overview";
        }

        @Override
        protected void run(SharedCase sharedCase) throws Exception {
            BaselineRows.fromJson(sharedCase.input()).write(jdbc, clock);
            UUID administrator = BaselineRows.administratorId();
            MockHttpServletRequestBuilder call = get("/api/admin/donations/overview")
                    .with(jwt().jwt(token -> token.subject(administrator.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")));
            JsonNode year = sharedCase.input().get("year");
            if (!year.isNull()) {
                call = call.param("year", Integer.toString(year.asInt()));
            }

            assertThat(GoldenFiles.canonical(answer(call))).isEqualTo(GoldenFiles.canonical(sharedCase.expected()));
        }
    }

    @Nested
    @DisplayName("Given the donor summary cases")
    class DonorSummaryCases extends SharedCaseRunner {

        @Override
        protected String caseFile() {
            return "donor-summary/summary.json";
        }

        @Override
        protected String when() {
            return "when the backend reads the donor's donations with the real query and summarizes them";
        }

        @Override
        protected String then() {
            return "then the donor gets the expected summary";
        }

        @Override
        protected void run(SharedCase sharedCase) throws Exception {
            assertThat(firstReceiptYear.year().getValue()).as("the first receipt year this runner's backend is configured with")
                    .isEqualTo(sharedCase.input().get("firstReceiptYear").asInt());
            BaselineRows rows = BaselineRows.fromJson(sharedCase.input());
            rows.write(jdbc, clock);
            UUID donor = rows.donorId(sharedCase.input().get("donor").asString());
            MockHttpServletRequestBuilder call = get("/api/donations/me/summary")
                    .with(jwt().jwt(token -> token.subject(donor.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority("ROLE_DONOR")));

            assertThat(GoldenFiles.canonical(answer(call))).isEqualTo(GoldenFiles.canonical(sharedCase.expected()));
        }
    }

    private JsonNode answer(MockHttpServletRequestBuilder call) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(call.header("Accept-Language", "cs")).andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }
}
