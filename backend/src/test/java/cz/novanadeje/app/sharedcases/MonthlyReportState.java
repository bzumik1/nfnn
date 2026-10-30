package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.support.MailContents;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.Optional;

public final class MonthlyReportState {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private MonthlyReportState() {
    }

    public static ObjectNode figures(MonthlyReport report) {
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

    public static ObjectNode mail(MimeMessage message) throws MessagingException {
        ObjectNode node = NODES.objectNode();
        node.put("subject", message.getSubject());
        ArrayNode lines = node.putArray("text");
        MailContents.plainText(message).lines().forEach(lines::add);
        return node;
    }

    private static ObjectNode tally(Tally tally) {
        ObjectNode node = NODES.objectNode();
        node.put("count", tally.count());
        node.put("totalMinor", tally.total().amountMinor());
        return node;
    }

    public record BankImport(Optional<String> lastAttemptedAt, Optional<String> lastSucceededAt, Optional<String> lastFailureKind) {

        public static BankImport fromJson(JsonNode node) {
            return new BankImport(CaseRows.optional(node.get("lastAttemptedAt")), CaseRows.optional(node.get("lastSucceededAt")),
                    CaseRows.optional(node.get("lastFailureKind")));
        }

        public void write(JdbcClient jdbc) {
            jdbc.sql("insert into bank_import_state (id, covered_from, covered_to, last_attempted_at, last_succeeded_at, last_failure_kind, "
                            + "last_failure_message, updated_at, consecutive_failures, reported_outage) values (1, null, null, :attempted, :succeeded, :kind, "
                            + "null, :attempted, :failures, null)")
                    .param("attempted", lastAttemptedAt.map(CaseRows::timestamp).orElse(null))
                    .param("succeeded", lastSucceededAt.map(CaseRows::timestamp).orElse(null))
                    .param("kind", lastFailureKind.orElse(null))
                    .param("failures", lastFailureKind.isPresent() ? 1 : 0)
                    .update();
        }
    }

    public record Sections(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {

        public static Sections fromJson(JsonNode node) {
            return new Sections(node.get("donors").asBoolean(), node.get("donations").asBoolean(), node.get("unpairedPayments").asBoolean(),
                    node.get("bankImport").asBoolean());
        }

        public void write(JdbcClient jdbc) {
            jdbc.sql("insert into donation_report_settings (id, recipients, send_day, send_hour, include_donors, include_donations, "
                            + "include_unpaired_payments, include_bank_import, updated_at) values (1, 'vybor@example.cz', 1, 6, :donors, :donations, :unpaired, :bank, "
                            + "'2026-01-01T00:00:00Z')")
                    .param("donors", donors)
                    .param("donations", donations)
                    .param("unpaired", unpairedPayments)
                    .param("bank", bankImport)
                    .update();
        }
    }
}
