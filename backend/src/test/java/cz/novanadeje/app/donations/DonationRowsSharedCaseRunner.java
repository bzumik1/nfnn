package cz.novanadeje.app.donations;

import cz.novanadeje.app.donations.application.receipt.DonationReceiptService;
import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.CaseRows.ReceiptToIssue;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RateLimiterWindows;
import cz.novanadeje.app.support.ReceiptSignatories;
import cz.novanadeje.app.support.ServerReceiptSigningKey;
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
import java.time.Year;
import java.util.List;
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
    @Autowired
    private DonationReceiptService receipts;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    protected CaseRows writeRows(JsonNode input) {
        CaseRows rows = CaseRows.fromJson(input);
        rows.write(jdbc, clock);
        issueReceiptsOf(rows);
        RateLimiterWindows.reset(context);
        return rows;
    }

    private void issueReceiptsOf(CaseRows rows) {
        List<ReceiptToIssue> toIssue = rows.receiptsToIssue();
        if (toIssue.isEmpty()) {
            return;
        }
        clock.set(toIssue.getFirst().issuedAt());
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
        ReceiptSignatories.chooseAfterEmptyTables(jdbc, clock.instant());
        for (ReceiptToIssue receipt : toIssue) {
            clock.set(receipt.issuedAt());
            DonorReference donor = new DonorReference(receipt.donor());
            DonationReceipt issued = receipt.yearly()
                    ? receipts.issueForYear(donor, Year.of(receipt.year().orElseThrow()))
                    : receipts.issueForDonation(donor, new DonationId(receipt.donation().orElseThrow()));
            rows.issued(receipt, issued.id().value());
        }
        clock.set(rows.now());
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
