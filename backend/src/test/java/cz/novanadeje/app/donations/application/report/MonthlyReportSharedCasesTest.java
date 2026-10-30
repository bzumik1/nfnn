package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.sharedcases.MonthlyReportState;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.support.RecordingMailSender;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;

class MonthlyReportSharedCasesTest extends DonationRowsSharedCaseRunner {

    @Autowired
    private RecordingMailSender mail;
    @Autowired
    private MonthlyReportService monthlyReports;

    @Override
    protected String caseFile() {
        return "monthly-report/report.json";
    }

    @Override
    protected String when() {
        return "when the backend compiles the month's report over its rows with the real queries and mails it in Czech";
    }

    @Override
    protected String then() {
        return "then the report holds the expected figures and the e-mail the expected subject and text";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        writeRows(input);
        MonthlyReportState.BankImport.fromJson(input.get("bankImport")).write(jdbc());
        MonthlyReportState.Sections.fromJson(input.get("sections")).write(jdbc());
        mail.clear();
        clearInvocations(reportSender());

        monthlyReports.sendReportFor(new ReportMonth(YearMonth.parse(input.get("month").asString())));

        ArgumentCaptor<MonthlyReport> report = ArgumentCaptor.forClass(MonthlyReport.class);
        verify(reportSender()).send(report.capture(), any());
        assertThat(mail.sent()).as("e-mails sent for %s", sharedCase.name()).hasSize(1);
        ObjectNode sent = JsonNodeFactory.instance.objectNode();
        sent.set("figures", MonthlyReportState.figures(report.getValue()));
        sent.setAll(MonthlyReportState.mail(mail.sent().getFirst()));
        assertGives(sent, sharedCase.expected());
    }
}
