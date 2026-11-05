package cz.novanadeje.app.donations;

import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RateLimiterWindows;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@DonationRowsContext
public abstract class DonationRowsSharedCaseRunner extends SharedCaseRunner {

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private MonthlyReportSender reportSender;
    @Autowired
    private ConfigurableApplicationContext context;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    protected CaseRows writeRows(JsonNode input) {
        CaseRows rows = CaseRows.fromJson(input);
        rows.write(jdbc, clock);
        RateLimiterWindows.reset(context);
        return rows;
    }

    protected JdbcClient jdbc() {
        return jdbc;
    }

    protected MonthlyReportSender reportSender() {
        return reportSender;
    }

    protected JsonNode answerAs(UUID subject, String role, MockHttpServletRequestBuilder call) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(call.header("Accept-Language", "cs")
                .with(jwt().jwt(token -> token.subject(subject.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority(role))))
                .andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }
}
