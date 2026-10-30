package cz.novanadeje.app.regression;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingMailSender;
import cz.novanadeje.app.support.TestSupportConfiguration;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@Import({TestcontainersConfiguration.class, TestSupportConfiguration.class})
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-",
        "app.donations.receipt.first-year=" + OverviewGoldenCasesTest.FIRST_RECEIPT_YEAR})
@AutoConfigureMockMvc
class OverviewGoldenCasesTest {

    static final String ADMIN_OVERVIEW_CASES = "shared-cases/admin-overview/year-overview.json";
    static final String DONOR_SUMMARY_CASES = "shared-cases/donor-summary/summary.json";
    static final String MONTHLY_REPORT_CASES = "shared-cases/monthly-report/report.json";
    static final int FIRST_RECEIPT_YEAR = 2026;
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private RecordingMailSender mail;
    @Autowired
    private MonthlyReportService monthlyReports;
    @MockitoSpyBean
    private MonthlyReportSender reportSender;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).truncateAllTables();
    }

    @Test
    @DisplayName("Given the admin overview cases, when v2 answers GET /api/admin/donations/overview over their rows, then the answers equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_answers_the_admin_overview_cases() throws Exception {
        GoldenFiles.assertMatches(ADMIN_OVERVIEW_CASES, adminOverviewCases());
    }

    @Test
    @DisplayName("Given the donor summary cases, when v2 answers GET /api/donations/me/summary over their rows, then the answers equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_answers_the_donor_summary_cases() throws Exception {
        GoldenFiles.assertMatches(DONOR_SUMMARY_CASES, donorSummaryCases());
    }

    @Test
    @DisplayName("Given the monthly report cases, when v2 compiles and mails the report over their rows, then its figures and text equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_compiles_and_mails_the_monthly_report_cases() throws Exception {
        GoldenFiles.assertMatches(MONTHLY_REPORT_CASES, monthlyReportCases());
    }

    @Test
    @DisplayName("Given the overview, summary and report cases, when they are generated twice, then both runs give identical files")
    void should_give_identical_files_when_the_cases_are_generated_twice() throws Exception {
        assertThat(GoldenFiles.canonical(adminOverviewCases())).isEqualTo(GoldenFiles.canonical(adminOverviewCases()));
        assertThat(GoldenFiles.canonical(donorSummaryCases())).isEqualTo(GoldenFiles.canonical(donorSummaryCases()));
        assertThat(GoldenFiles.canonical(monthlyReportCases())).isEqualTo(GoldenFiles.canonical(monthlyReportCases()));
    }

    private ObjectNode adminOverviewCases() throws Exception {
        List<OverviewCase> cases = List.of(
                new OverviewCase("an empty database in March", BaselineRows.at("2026-03-15T09:00:00Z"), Optional.empty()),
                new OverviewCase("gifts, a refund, a verification payment, a manual gift and unpaired payments over three months", busyQuarter(), Optional.empty()),
                new OverviewCase("the same quarter asked for by its year", busyQuarter(), Optional.of(2026)),
                new OverviewCase("Prague month boundaries for gifts, payments and registrations", BaselineRows.at("2026-04-10T08:00:00Z")
                        .donor("jana", "2026-01-31T22:59:59Z")
                        .donor("petr", "2026-01-31T23:00:00Z")
                        .donor("eva", "2026-03-29T00:30:00Z")
                        .donor("ota", "2026-03-31T22:00:00Z")
                        .gift("jana", "2026-01-31", 10000)
                        .gift("petr", "2026-02-01", 20000)
                        .unpaired("2026-02-28", 3000)
                        .unpaired("2026-03-01", 4000), Optional.empty()),
                new OverviewCase("the Prague year boundary", BaselineRows.at("2026-01-01T00:30:00Z")
                        .donor("jana", "2025-12-31T22:59:59Z")
                        .donor("petr", "2025-12-31T23:00:00Z")
                        .gift("jana", "2025-12-31", 10000)
                        .gift("petr", "2026-01-01", 20000)
                        .unpaired("2025-12-31", 3000), Optional.empty()),
                new OverviewCase("a past year with every month, asked for while the current year is empty", pastYear(), Optional.of(2025)),
                new OverviewCase("the current year offered first when only past years hold data", pastYear(), Optional.empty()),
                new OverviewCase("a year not yet started", pastYear(), Optional.of(2027)),
                new OverviewCase("December with all twelve months and an erased donor", BaselineRows.at("2026-12-31T22:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .erasedDonor("petr", "2026-06-15T10:00:00Z", "2026-11-01T10:00:00Z")
                        .gift("jana", "2026-01-15", 10000)
                        .gift("petr", "2026-06-15", 20000)
                        .gift("jana", "2026-12-31", 30000), Optional.empty()),
                new OverviewCase("the first day of a month opens that month", BaselineRows.at("2026-02-28T23:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .gift("jana", "2026-01-15", 10000), Optional.empty()),
                new OverviewCase("a leap February and a registration at midnight of 1 March in Prague", BaselineRows.at("2028-03-10T10:00:00Z")
                        .donor("jana", "2028-02-28T10:00:00Z")
                        .donor("petr", "2028-02-29T23:00:00Z")
                        .gift("jana", "2028-02-29", 29029)
                        .gift("petr", "2028-03-01", 10000)
                        .unpaired("2028-02-29", 2900), Optional.empty()),
                new OverviewCase("large totals in one month", BaselineRows.at("2026-06-15T10:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .donor("firma", "2026-02-15T10:00:00Z")
                        .gift("jana", "2026-06-01", 100000000)
                        .gift("firma", "2026-06-02", 99999999), Optional.empty()),
                new OverviewCase("a year with only payments and no donations", BaselineRows.at("2026-05-05T10:00:00Z")
                        .unpaired("2024-07-01", 5000)
                        .unpairedByAdmin("2024-08-01", 6000), Optional.of(2024)));
        ArrayNode entries = NODES.arrayNode();
        for (OverviewCase overviewCase : cases) {
            overviewCase.rows().write(jdbc, clock);
            UUID admin = BaselineRows.administratorId();
            MockHttpServletRequestBuilder call = get("/api/admin/donations/overview")
                    .with(jwt().jwt(token -> token.subject(admin.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")));
            if (overviewCase.year().isPresent()) {
                call = call.param("year", overviewCase.year().get().toString());
            }
            ObjectNode input = overviewCase.rows().toJson();
            overviewCase.year().ifPresentOrElse(year -> input.put("year", year), () -> input.putNull("year"));
            entries.add(entry(overviewCase.name(), input, answer(call)));
        }
        return header("The administration's year overview that GET /api/admin/donations/overview[?year=] answers (AdminOverviewService over "
                + "the real queries, then YearOverview.compile): input.year is the requested year or null; the expected value is the answer as sent. " + BaselineRows.DESCRIPTION,
                entries);
    }

    private ObjectNode donorSummaryCases() throws Exception {
        List<SummaryCase> cases = List.of(
                new SummaryCase("a donor without gifts", BaselineRows.at("2026-10-20T10:00:00Z").donor("jana", "2026-01-15T10:00:00Z"), "jana"),
                new SummaryCase("gifts in three years, a refund and another donor's gifts", BaselineRows.at("2026-10-20T10:00:00Z")
                        .donor("jana", "2024-01-15T10:00:00Z")
                        .donor("petr", "2024-01-15T10:00:00Z")
                        .gift("jana", "2024-12-31", 10000)
                        .gift("jana", "2025-01-01", 20050)
                        .gift("jana", "2025-06-30", 30000)
                        .refunded("jana", "2026-09-30", 99900)
                        .gift("jana", "2026-03-15", 50000)
                        .manual("jana", "2026-04-01", 7000)
                        .verification("jana", "2026-05-05", 100)
                        .gift("petr", "2026-03-16", 1000000), "jana"),
                new SummaryCase("only a refunded gift", BaselineRows.at("2026-10-20T10:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .refunded("jana", "2026-02-02", 50000), "jana"),
                new SummaryCase("the last evening of the year in Prague", BaselineRows.at("2026-12-31T22:59:59Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .gift("jana", "2026-12-31", 50000), "jana"),
                new SummaryCase("the first minute of the new year in Prague", BaselineRows.at("2026-12-31T23:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .gift("jana", "2026-12-31", 50000), "jana"),
                new SummaryCase("large amounts and hellers", BaselineRows.at("2026-10-20T10:00:00Z")
                        .donor("jana", "2026-01-15T10:00:00Z")
                        .gift("jana", "2026-01-02", 100000000)
                        .gift("jana", "2026-01-03", 99999999)
                        .gift("jana", "2026-01-04", 1), "jana"));
        ArrayNode entries = NODES.arrayNode();
        for (SummaryCase summaryCase : cases) {
            summaryCase.rows().write(jdbc, clock);
            UUID donor = summaryCase.rows().donorId(summaryCase.donor());
            MockHttpServletRequestBuilder call = get("/api/donations/me/summary")
                    .with(jwt().jwt(token -> token.subject(donor.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority("ROLE_DONOR")));
            ObjectNode input = summaryCase.rows().toJson();
            input.put("donor", summaryCase.donor());
            input.put("firstReceiptYear", FIRST_RECEIPT_YEAR);
            entries.add(entry(summaryCase.name(), input, answer(call)));
        }
        return header("The donor's summary that GET /api/donations/me/summary answers to input.donor (DonorDonationsService over the real query, "
                + "then DonationSummary): firstReceiptYear is the setting RECEIPT_FIRST_YEAR; the expected value is the answer as sent. " + BaselineRows.DESCRIPTION, entries);
    }

    private ObjectNode monthlyReportCases() throws Exception {
        BankImport succeeded = new BankImport(Optional.of("2026-03-01T05:00:00Z"), Optional.of("2026-03-01T05:00:00Z"), Optional.empty());
        List<ReportCase> cases = List.of(
                new ReportCase("a February with gifts, a refund, unpaired payments and January's gifts in the year to date", busyQuarter().now("2026-03-01T06:00:00Z"),
                        "2026-02", succeeded, Sections.ALL),
                new ReportCase("a January that leaves December out of the year to date", BaselineRows.at("2026-02-01T06:00:00Z")
                        .donor("jana", "2025-12-31T22:59:59Z")
                        .donor("petr", "2025-12-31T23:00:00Z")
                        .gift("jana", "2025-12-31", 10000)
                        .gift("petr", "2026-01-01", 20000)
                        .unpaired("2025-12-31", 3000)
                        .unpaired("2026-01-31", 4000), "2026-01",
                        new BankImport(Optional.of("2026-02-01T05:00:00Z"), Optional.of("2026-01-31T23:30:00Z"), Optional.empty()), Sections.ALL),
                new ReportCase("an empty month and a bank import that never succeeded", BaselineRows.at("2026-04-01T06:00:00Z"), "2026-03",
                        new BankImport(Optional.of("2026-03-31T21:59:00Z"), Optional.empty(), Optional.of("UNAUTHORIZED")), Sections.ALL),
                new ReportCase("a failure after the last success in summer time", BaselineRows.at("2026-08-01T06:00:00Z")
                        .donor("jana", "2026-07-31T21:59:59Z")
                        .donor("petr", "2026-07-31T22:00:00Z")
                        .gift("jana", "2026-07-31", 125050), "2026-07",
                        new BankImport(Optional.of("2026-07-31T22:30:00Z"), Optional.of("2026-07-31T21:00:00Z"), Optional.of("TRANSPORT")), Sections.ALL),
                new ReportCase("only the donations section", busyQuarter().now("2026-04-02T06:00:00Z"), "2026-03", succeeded,
                        new Sections(false, true, false, false)),
                new ReportCase("an erased donor and the change to summer time", BaselineRows.at("2026-04-01T06:00:00Z")
                        .erasedDonor("jana", "2026-03-29T00:59:00Z", "2026-03-30T10:00:00Z")
                        .donor("petr", "2026-03-29T01:00:00Z")
                        .gift("jana", "2026-03-29", 100000000)
                        .gift("petr", "2026-03-30", 99999999), "2026-03",
                        new BankImport(Optional.of("2026-03-29T01:30:00Z"), Optional.of("2026-03-29T01:30:00Z"), Optional.empty()), Sections.ALL));
        ArrayNode entries = NODES.arrayNode();
        for (ReportCase reportCase : cases) {
            reportCase.rows().write(jdbc, clock);
            reportCase.bankImport().write(jdbc);
            reportCase.sections().write(jdbc);
            mail.clear();
            clearInvocations(reportSender);
            monthlyReports.sendReportFor(new ReportMonth(YearMonth.parse(reportCase.month())));
            ArgumentCaptor<MonthlyReport> report = ArgumentCaptor.forClass(MonthlyReport.class);
            verify(reportSender).send(report.capture(), any());
            assertThat(mail.sent()).as(reportCase.name()).hasSize(1);
            ObjectNode input = reportCase.rows().toJson();
            input.put("month", reportCase.month());
            input.set("bankImport", reportCase.bankImport().toJson());
            input.set("sections", reportCase.sections().toJson());
            ObjectNode expected = NODES.objectNode();
            expected.set("figures", figures(report.getValue()));
            expected.setAll(mailOf(mail.sent().getFirst()));
            entries.add(entry(reportCase.name(), input, expected));
        }
        return header("The monthly report e-mail for input.month (MonthlyReportService over the real queries, then MonthlyReport.compile and "
                + "MonthlyReportEmailSender in Czech): figures are the compiled report, text the plain text part line by line; bankImport is the "
                + "bank_import_state row (instants, failure kind or null) and sections the report settings. " + BaselineRows.DESCRIPTION, entries);
    }

    private static ObjectNode figures(MonthlyReport report) {
        ObjectNode figures = NODES.objectNode();
        figures.put("month", report.month().toString());
        figures.put("donorsRegistered", report.donors().registered());
        figures.put("newDonorsInMonth", report.donors().newInMonth());
        figures.set("receivedInMonth", tally(report.receivedInMonth()));
        figures.set("pairedInMonth", tally(report.pairedInMonth()));
        figures.set("unpairedInMonth", tally(report.unpairedInMonth()));
        figures.set("receivedInYear", tally(report.receivedInYear()));
        ObjectNode bank = figures.putObject("bankImport");
        report.bankImport().lastSucceededAt().ifPresentOrElse(at -> bank.put("lastSucceededAt", at.toString()), () -> bank.putNull("lastSucceededAt"));
        report.bankImport().lastFailure().ifPresentOrElse(failure -> {
            ObjectNode node = bank.putObject("lastFailure");
            node.put("kind", failure.kind().name());
            node.put("attemptedAt", failure.attemptedAt().toString());
        }, () -> bank.putNull("lastFailure"));
        return figures;
    }

    private static ObjectNode tally(Tally tally) {
        ObjectNode node = NODES.objectNode();
        node.put("count", tally.count());
        node.put("totalMinor", tally.total().amountMinor());
        return node;
    }

    private static ObjectNode mailOf(MimeMessage message) throws MessagingException {
        ObjectNode node = NODES.objectNode();
        node.put("subject", message.getSubject());
        ArrayNode lines = node.putArray("text");
        MailContents.plainText(message).lines().forEach(lines::add);
        return node;
    }

    private JsonNode answer(MockHttpServletRequestBuilder call) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(call.header("Accept-Language", "cs")).andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }

    private static BaselineRows busyQuarter() {
        return BaselineRows.at("2026-03-20T09:00:00Z")
                .donor("jana", "2026-01-05T09:00:00Z")
                .donor("petr", "2026-02-10T12:00:00Z")
                .donor("firma", "2026-03-01T08:00:00Z")
                .gift("jana", "2026-01-05", 50000)
                .gift("jana", "2026-02-05", 125050)
                .refunded("jana", "2026-02-06", 20000)
                .verification("petr", "2026-02-10", 100)
                .gift("petr", "2026-02-11", 100000)
                .manual("firma", "2026-03-02", 1000000)
                .unpaired("2026-01-20", 3000)
                .unpaired("2026-02-20", 4550)
                .unpairedByAdmin("2026-03-03", 7000);
    }

    private static BaselineRows pastYear() {
        return BaselineRows.at("2026-02-10T10:00:00Z")
                .donor("jana", "2024-11-15T10:00:00Z")
                .donor("petr", "2025-06-15T10:00:00Z")
                .gift("jana", "2025-01-02", 10000)
                .gift("petr", "2025-06-15", 20000)
                .gift("jana", "2025-12-31", 30000)
                .unpaired("2024-03-01", 5000)
                .unpaired("2025-07-07", 6000);
    }

    private static ObjectNode header(String logic, ArrayNode cases) {
        ObjectNode file = NODES.objectNode();
        file.put("source", ApiTranscripts.SOURCE);
        file.put("logic", logic);
        file.set("cases", cases);
        return file;
    }

    private static ObjectNode entry(String name, ObjectNode input, JsonNode expected) {
        ObjectNode entry = NODES.objectNode();
        entry.put("name", name);
        entry.set("input", input);
        entry.set("expected", expected);
        return entry;
    }

    private record OverviewCase(String name, BaselineRows rows, Optional<Integer> year) {
    }

    private record SummaryCase(String name, BaselineRows rows, String donor) {
    }

    private record ReportCase(String name, BaselineRows rows, String month, BankImport bankImport, Sections sections) {
    }

    private record BankImport(Optional<String> lastAttemptedAt, Optional<String> lastSucceededAt, Optional<String> lastFailureKind) {

        void write(JdbcClient jdbc) {
            jdbc.sql("insert into bank_import_state (id, covered_from, covered_to, last_attempted_at, last_succeeded_at, last_failure_kind, "
                            + "last_failure_message, updated_at, consecutive_failures, reported_outage) values (1, null, null, :attempted, :succeeded, :kind, "
                            + "null, :attempted, :failures, null)")
                    .param("attempted", lastAttemptedAt.map(BaselineRows::timestamp).orElse(null))
                    .param("succeeded", lastSucceededAt.map(BaselineRows::timestamp).orElse(null))
                    .param("kind", lastFailureKind.orElse(null))
                    .param("failures", lastFailureKind.isPresent() ? 1 : 0)
                    .update();
        }

        ObjectNode toJson() {
            ObjectNode node = NODES.objectNode();
            put(node, "lastAttemptedAt", lastAttemptedAt);
            put(node, "lastSucceededAt", lastSucceededAt);
            put(node, "lastFailureKind", lastFailureKind);
            return node;
        }
    }

    private record Sections(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {

        static final Sections ALL = new Sections(true, true, true, true);

        void write(JdbcClient jdbc) {
            jdbc.sql("insert into donation_report_settings (id, recipients, send_day, send_hour, include_donors, include_donations, "
                            + "include_unpaired_payments, include_bank_import, updated_at) values (1, 'vybor@example.cz', 1, 6, :donors, :donations, :unpaired, :bank, "
                            + "'2026-01-01T00:00:00Z')")
                    .param("donors", donors)
                    .param("donations", donations)
                    .param("unpaired", unpairedPayments)
                    .param("bank", bankImport)
                    .update();
        }

        ObjectNode toJson() {
            ObjectNode node = NODES.objectNode();
            node.put("donors", donors);
            node.put("donations", donations);
            node.put("unpairedPayments", unpairedPayments);
            node.put("bankImport", bankImport);
            return node;
        }
    }

    private static void put(ObjectNode node, String field, Optional<String> value) {
        value.ifPresentOrElse(present -> node.put(field, present), () -> node.putNull(field));
    }

}
